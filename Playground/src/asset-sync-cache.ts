// Diff-based asset-sync bookkeeping for the MonoGame runtime.
//
// syncAssetsToRuntime() (main.ts) builds the set of assets that should be
// registered after a Run, then diffs it against what it believes is
// already registered so repeat Runs are cheap: unchanged audio isn't
// re-decoded, unchanged textures aren't re-uploaded to the GPU.
//
// The subtle correctness hazard this module exists to manage: the "what's
// already registered" belief lives on the PAGE, but the actual registry
// (BrowserContentManager._assets) lives in the iframe's Game1. Those two
// can silently diverge. When a program hits a fatal tick error or trips
// the frame watchdog, the runtime nulls its Game1; the *next* Run rebuilds
// a brand-new Game1 with an EMPTY content manager. If the page still
// believes those assets are registered (hashes unchanged), the diff skips
// re-registration and every subsequent Run fails with
//   Asset 'X' is not registered with BrowserContentManager. Registered: []
// until the page is reloaded.
//
// The fix: whenever the runtime's content manager is known to have been
// (or is about to be) torn down, call invalidate() so the next diff
// re-registers everything from scratch. Because a fresh content manager
// holds nothing, a full re-register is also free of the stale-Texture2D
// hazard that the unregister/register pairing normally guards against.

export type SyncedAssetKind = 'image' | 'audio' | 'font' | 'shader' | 'xnb';

export interface SyncedAssetState {
    kind: SyncedAssetKind;
    hash: string;
}

export interface PendingAsset {
    name: string;
    kind: SyncedAssetKind;
    hash: string;
    bytes: Uint8Array;
}

export interface AssetSyncPlan {
    /** Assets to evict — either gone from the target set or changed bytes. */
    toUnregister: Array<{ name: string; kind: SyncedAssetKind }>;
    /** Assets to (re-)register — new or changed bytes. */
    toRegister: PendingAsset[];
    /** Count of assets left untouched because their bytes were unchanged. */
    skipped: number;
}

export class AssetSyncCache {
    private last = new Map<string, SyncedAssetState>();

    /** Forget everything we think is registered. Call when the runtime's
     *  content manager has been (or will be) torn down — fatal tick error,
     *  watchdog rebuild, or an observed "not registered" failure — so the
     *  next diff() re-registers the full target set. */
    invalidate(): void {
        this.last.clear();
    }

    /** How many assets we currently believe are registered. */
    get size(): number {
        return this.last.size;
    }

    /** Compute the register/unregister plan needed to move the runtime
     *  from the last committed baseline to `target`. Does NOT mutate the
     *  baseline — call commit() once the plan has been applied. */
    diff(target: Map<string, PendingAsset>): AssetSyncPlan {
        const toUnregister: Array<{ name: string; kind: SyncedAssetKind }> = [];
        const toRegister: PendingAsset[] = [];
        let skipped = 0;

        for (const [name, last] of this.last) {
            const next = target.get(name);
            if (!next) {
                toUnregister.push({ name, kind: last.kind });
            } else if (next.hash !== last.hash) {
                toUnregister.push({ name, kind: last.kind });
                toRegister.push(next);
            } else {
                skipped++;
            }
        }
        for (const [name, next] of target) {
            if (!this.last.has(name)) toRegister.push(next);
        }
        return { toUnregister, toRegister, skipped };
    }

    /** Adopt `target` as the new baseline of what's registered. */
    commit(target: Map<string, PendingAsset>): void {
        this.last.clear();
        for (const [name, p] of target) {
            this.last.set(name, { kind: p.kind, hash: p.hash });
        }
    }
}

/** True when a runtime stderr line reports the BrowserContentManager asset
 *  registry came up empty (or missing an asset) — the signature of a Game1
 *  that was rebuilt out from under the page's sync cache. Used to self-heal
 *  by invalidating the cache so the next Run re-registers. */
export function isAssetNotRegisteredError(line: string): boolean {
    // Texture/font path: BrowserContentManager (C#) —
    //   "Asset 'X' is not registered with BrowserContentManager. Registered: []"
    // Audio path: window.fadeAudio (JS) —
    //   "[fade-audio] loadClip: X not registered. Registered: []"
    // Either signals the runtime came up without our assets, so both should
    // invalidate the sync cache and force a full re-register next Run.
    return line.includes('is not registered with BrowserContentManager')
        || /loadClip:.*not registered\. Registered:/i.test(line);
}
