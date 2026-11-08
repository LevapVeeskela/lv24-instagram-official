# Contributing

Issues and pull requests are welcome.

## Local checks

```sh
npm ci
npm run lint
npm run build
npm test
```

## Rules

- Keep dependency versions exact (no `^` or `~`).
- Public code must not import private `@instaagent/*` packages.
- Add a test for every behavior change or bug fix.
- Never commit session cookies, tokens, app secrets or `.env` files.
- Keep the public API surface curated; discuss new exports in an issue first.

By contributing you agree that your changes are licensed under the MIT license.
