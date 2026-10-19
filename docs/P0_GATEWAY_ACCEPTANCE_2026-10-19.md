# Matrix 360 — P0 gateway acceptance register (19 October 2026)

## Branch scope and governance
- Parent frontend PR: #6 (`feature/client-identity-gateway`) — login-first root routing.
- Security follow-up PR: #7 (`feature/client-gateway-session-hardening`); base is the parent feature branch, **not** production `main`.
- CRM backend: `Matrix360_CRM_Backend`, Render `Matrix360_CRM_Backend`, authenticated Supabase development CRM.
- Do not merge production or authorize real client accounts until Director go/no-go approval.

## Verified evidence
- Root `/` rewrites to `/login.html` in PR #6 source; guest route links to public `index.html`.
- Client gateway requests CRM auth and membership before displaying private CRM content.
- Existing PR #6 Vercel preview is READY, commit `6da4409`. This is **not** authenticated browser acceptance.
- Backend Render latest previously checked LIVE commit `7437aa6`; development CRM CI and public-origin preflight previously passed.
- PR #7 fixes stale in-flight sign-in and invalidates browser token immediately on sign-out; source-regression checks and JavaScript syntax passed GitHub Actions.
- PR #7 latest preview READY at `https://matrix360frontend-98pq196o0-matrix360s-projects.vercel.app/`.

## Critical unverified Friday requirements
1. Synthetic client A login, correct membership, lead list/create/update/refresh.
2. Synthetic client B login, isolation denial for A's workspace and records.
3. Third-client synthetic membership and login for Vrindavan Greens; use no real customer data.
4. Browser session expiry, failed sign-in, network failure, and logout/relogin.
5. Guest cannot access actual CRM records, including direct API calls.
6. Desktop/mobile navigation and public website regression.
7. Password-recovery or approved controlled pilot manual recovery procedure.
8. Single-client workspace shell labels/status/help; disconnected modules visibly unavailable.
9. Director go/no-go sign-off and reviewed production rollout/rollback.

## Integration status boundaries
- Mayur Audience Engine: independently developed; source documents local single-tenant mode, no verified SaaS tenant authorization. Do not connect for pilot.
- Pratha Campaign Engine: v0.4 simulation staging; separate authorization contract and client isolation required; real dispatch prohibited.
- Tanmayi Social Manager: Free Preview described as ephemeral and non-durable; no client publishing until authorized. Do not represent as live publishing.
- No direct Mayur-to-Pratha connection.

## Go/no-go
The Friday onboarding remains AMBER until items 1–6 pass in staging and the Director approves release. If they fail, offer a restricted supervised demonstration with synthetic data, not real client onboarding.
