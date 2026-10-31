# Isolated showcase release — 31 October 2026

This release replaces the prior static prototype with the reviewed Matrix360 application at the repository root. It preserves authentication while providing a separately labelled, fictional, browser-local showcase when `M360_SHOWCASE_ENABLED=true`.

- Starting main: `fd25bb4a6833702be565b690db9ade780ed3de33`.
- Prior Production deployment: `dpl_7yMBnLjLWpZ56AR817QTLxy9PQwL` (READY; same starting main SHA). This was found by explicitly filtering Production deployments; the earlier project summary did not expose it.
- Target: Matrix360's projects / `matrix360_frontend`, Production, stable alias `https://matrix360frontend.vercel.app`.
- Git connection and Production Branch `main` were verified. Framework is Other; application root is the repository root; Node 24.x.
- The actual source contains 12 API handlers, correcting the earlier audit count of 13. Public assets are explicitly included in function bundles. No plan upgrade or authorization removal is needed.
- Only the showcase flag was added to Production. Existing Preview credentials were not migrated.
- Tests run on checksum-verified official Node 24.22.2: 84 passed, zero failed/skipped. Paths now test the served `frontend-source` rather than its older sibling archive. Source tests cover public rendering, opt-in/rollback and anonymous direct API denial. Provider tests use synthetic fixtures.
- Customer workspace bindings and historical cache data are excluded. Legacy project names in demo templates and fixtures are fictionalized. No live customer records, `.env.local`, credentials, recovery archives, logs or screenshots are included.

## Verification boundary

This is an isolated UI demonstration. Demo profile and CRM edits are browser-local. AI generation, uploads, website research, lead scraping and publishing do not execute. No paid provider acceptance or live cancellation success is claimed.

## Rollback

To restore login, set `M360_SHOWCASE_ENABLED=false` or remove it and redeploy. Synthetic demo sessions are cleared by the normal dashboard bootstrap. Live integrations need their own privately configured credentials and approved workspace bindings.

To roll back the application, use the prior Production deployment above, or make a reviewed revert commit restoring the starting main content. Do not force-push or erase repository history. Preserve the correct target project and its Production domain assignment. Production protection should be public only for the isolated showcase; retain Preview protection.
