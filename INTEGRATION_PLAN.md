# Matrix360: verified source audit and backend connection gates (16 Oct 2026)

## Source repositories
- Public product frontend: `Matrix360repo/matrix360_frontend` (static HTML/CSS/JS). Its interactive actions are frontend simulations.
- Mayur: `Matrix360repo/Matrix360_Engine_v4_and_Exports` — Python/FastAPI + worker, local single-user SQLite/files, local auth cookie. Documented `GET /healthz`; dataset import/job/export APIs require a session.
- Tanmayi: `Matrix360repo/Matrix360_SocialManager_Free_Preview` — Python/FastAPI content creation/review/export, Lakhotia-only pilot, SQLite/assets, required cloud secret in deployed mode. Documented `GET /health`, `GET /api/brand`, `POST /api/generate`, `GET /api/drafts`, `POST /api/drafts/{id}/decision`.
- Alternative historical content repo: `Matrix360repo/socialmediamanager` (has other packaging). **This PR selects `SocialManager` as the candidate; confirm with the owner before production use.**
- Internal oversight project is a **different** Vercel project (`matrix-interns-dashboard`).

## This PR
Adds read-only `GET /api/integration-status`, a Vercel serverless connectivity probe.
Set **server-side** environment variables in the frontend Vercel project:
- `MATRIX360_MAYUR_API_URL` = HTTPS origin of a future hardened Mayur API.
- `MATRIX360_TANMAYI_API_URL` = HTTPS origin of the deployed authorized Tanmayi pilot.
The endpoint does not expose configured URLs, forward user data, or authenticate to either API.
Response `reachable` means public health probe responded, **not** that the product is integrated.
Do not set Mayur URL to a local `127.0.0.1` service: Vercel cannot reach it.

## Blockers to true UI-to-backend connection
1. Identify the exact public Vercel project that deploys `matrix360_frontend`; connected Vercel account returned 403 when listing its deployments.
2. Provide *backend HTTPS hostnames* and confirm those services are running; no backend URL has yet been verified.
3. Harden Mayur local single-user API for remote multi-tenant use: managed identity, tenant isolation, secure object storage, background workers and signed downloads. No client data to public pilot before this.
4. Protect Tanmayi with proper user/tenant authorization and durable storage; currently shared API key/Basic authentication and single-brand SQLite are insufficient for public multi-client access.
5. Implement Vercel server-side BFF routes that verify end-user identity, map user to authorized workspace, attach backend credentials **on the server**, validate inputs, prevent SSRF, enforce permissions, rate-limit, and audit every operation. Never put `MATRIX360_API_KEY`, cookies, or provider keys in public HTML.
6. Only then replace simulated frontend actions with BFF API calls, with loading, error and review states.
7. Automated tests: 401 unauthenticated, 403 cross-tenant, successful own-tenant request, timeout, invalid payload, 5xx, export permissions, no leaked tokens.
8. Final client approval before live campaign sending. **No automated publishing/spend without permission.**

## Architecture rule
Mayur's data engine and Pratha's lead intelligence engine must remain independently developed and tested. This proposal only envisages Mayur -> customer frontend and Tanmayi -> customer frontend as **separate services**. There is no Mayur-Pratha integration.

## Acceptance sequence
- Read-only probe returns not_configured until Vercel env is set.
- Each production backend is health-reachable using a real HTTPS endpoint.
- Authenticated frontend can access approved pilot flows via secured BFF.
- One complete creative review/export and one authorized data-processing test using approved synthetic data.
- Results and API failures logged and reproducible; director approval before sensitive client data moves.

## Confirmed deployment target
Frontend production URL: https://matrix360frontend.vercel.app/app.html (main). This is a frontend URL, not a deployed backend address. Render Free Preview records are ephemeral; use synthetic data only.
