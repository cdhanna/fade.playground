# Changelog

All notable changes to the Fade Playground are recorded here. The
**Deploy (production)** workflow extracts the section matching the release
version and uses it as the GitHub Release notes, so keep the `## [x.y.z]`
headers exact — the extractor matches on `## [<version>]`.

Format follows [Keep a Changelog](https://keepachangelog.com/); this project
uses semver-ish `major.minor.patch` tags (`vX.Y.Z`).

## [Unreleased]

## [0.1.0] - 2026-07-02
### Added
- Initial standalone **Fade.Playground** repo, migrated out of the dby
  monorepo so the Playground can release on its own cadence. Contains the
  Playground app, the **ghostBot** Tauri companion, and the **oauth-proxy**
  Cloudflare Worker.
- Web/MonoGame runtimes are consumed via published nupkgs (`package` mode) or
  sibling source checkouts (`source` mode); pins live in
  `Playground/runtime-versions.json`.
- GitHub Actions: `ci.yml`, `deploy-test.yml` (auto → tests URL),
  `deploy-prod.yml` (manual production + this changelog-driven release), and
  `ghostbot-release.yml`.
