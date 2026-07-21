import { describe, it, expect } from 'vitest';
import {
    AssetSyncCache,
    isAssetNotRegisteredError,
    type PendingAsset,
} from './asset-sync-cache';

const asset = (name: string, hash: string, kind: PendingAsset['kind'] = 'image'): PendingAsset => ({
    name, kind, hash, bytes: new Uint8Array([1, 2, 3]),
});

const target = (...assets: PendingAsset[]) => {
    const m = new Map<string, PendingAsset>();
    for (const a of assets) m.set(a.name, a);
    return m;
};

describe('AssetSyncCache', () => {
    it('registers everything on the first sync', () => {
        const cache = new AssetSyncCache();
        const t = target(asset('tilemap_packed-1', 'h1'));
        const plan = cache.diff(t);
        expect(plan.toRegister.map((a) => a.name)).toEqual(['tilemap_packed-1']);
        expect(plan.toUnregister).toEqual([]);
        expect(plan.skipped).toBe(0);
    });

    it('skips unchanged assets on a repeat sync (the optimization)', () => {
        const cache = new AssetSyncCache();
        const t = target(asset('tilemap_packed-1', 'h1'));
        cache.commit(t);

        const plan = cache.diff(target(asset('tilemap_packed-1', 'h1')));
        expect(plan.toRegister).toEqual([]);
        expect(plan.skipped).toBe(1);
    });

    it('re-registers an asset whose bytes changed, evicting the stale one', () => {
        const cache = new AssetSyncCache();
        cache.commit(target(asset('tilemap_packed-1', 'h1')));

        const plan = cache.diff(target(asset('tilemap_packed-1', 'h2')));
        expect(plan.toUnregister.map((a) => a.name)).toEqual(['tilemap_packed-1']);
        expect(plan.toRegister.map((a) => a.name)).toEqual(['tilemap_packed-1']);
    });

    // The regression. After a fatal tick error / watchdog timeout the
    // runtime rebuilds Game1 with an EMPTY BrowserContentManager. The page
    // still believes the assets are registered, so without invalidation the
    // diff skips them and the game loads against an empty registry —
    // "Registered: []" — on every subsequent Run until a page reload.
    it('without invalidate, a rebuilt (empty) runtime still gets skipped — reproduces the bug', () => {
        const cache = new AssetSyncCache();
        cache.commit(target(asset('tilemap_packed-1', 'h1')));

        // Runtime silently rebuilt its content manager here (page unaware).
        const plan = cache.diff(target(asset('tilemap_packed-1', 'h1')));
        expect(plan.toRegister).toEqual([]);   // nothing re-registered → broken
        expect(plan.skipped).toBe(1);
    });

    it('after invalidate, the next sync re-registers everything (the fix)', () => {
        const cache = new AssetSyncCache();
        cache.commit(target(asset('tilemap_packed-1', 'h1')));

        // The page learned the runtime was torn down (onGameError / stderr).
        cache.invalidate();
        expect(cache.size).toBe(0);

        const plan = cache.diff(target(asset('tilemap_packed-1', 'h1')));
        expect(plan.toRegister.map((a) => a.name)).toEqual(['tilemap_packed-1']);
        expect(plan.toUnregister).toEqual([]);   // fresh runtime: nothing to evict
        expect(plan.skipped).toBe(0);
    });
});

describe('isAssetNotRegisteredError', () => {
    it('matches the BrowserContentManager empty-registry error', () => {
        const line = "[fade] texture load failed: 'tilemap_packed-1': Asset " +
            "'tilemap_packed-1' is not registered with BrowserContentManager. Registered: []";
        expect(isAssetNotRegisteredError(line)).toBe(true);
    });

    it('ignores unrelated stderr lines', () => {
        expect(isAssetNotRegisteredError('[fade] some other warning')).toBe(false);
        expect(isAssetNotRegisteredError('print output: hello')).toBe(false);
    });
});
