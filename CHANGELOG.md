# Changelog

All notable changes to `@lv24/instagram-official` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-11-09

### Fixed

- `createMediaContainer` now sends `video_url` for `REELS` and `STORIES`
  containers (previously only `VIDEO`), so those containers are no longer
  created without media.
- `CAROUSEL` containers are rejected with `NotImplemented` instead of sending
  an invalid request; unsupported media types return `InvalidInput`.

### Tests

- Added coverage for REELS/STORIES `video_url` and the CAROUSEL guard
  (25 tests total).

## [0.1.0] — 2026-11-08

### Added

- `OAuth2Manager`: authorization URL, code exchange, long-lived token exchange,
  refresh, token info, validation and revocation.
- `OAuth2Scope`, `OAuth2Config`, `OAuth2Tokens`, `OAuth2UserInfo`, `TokenType`
  and URL helpers.
- `TokenManager` with automatic refresh, plus `InMemoryTokenStorage` and
  `FileTokenStorage`.
- `GraphApiProcessor` for profile, media, stories, insights, comments,
  hashtags, search, media containers and publishing.
- Injectable `IHttpClient` transport (`UndiciHttpClient` or a mock) and
  `FetchHttpClient` for the default OAuth2 path.
- MIT license, ESM, Node.js >= 20.

### Notes

- First public release, extracted from the private LV24 InstaAgent monorepo.
- Depends on `@lv24/kernel` `0.1.0` (exact).
