# Pratha Campaign Operations — Frontend Integration (October 2026)

## Scope and verification
- Additive page: `pratha.html` launched from Command Center > Campaign operations.
- Existing website and modules remain intact.
- **Demo mode** is local browser simulation, ephemeral and explicitly NOT real backend data.
- **Connected mode** expects a same-origin authenticated server gateway at `/api/pratha/*`. This gateway **does not exist in this frontend PR**. It must not be exposed publicly without proper session authentication, client authorization and CSRF safeguards.
- No Mayur or Tanmayi runtime dependency; no integration is authorized.
- No live email or WhatsApp sending.

## Backend contracts needed
- `GET /api/pratha/health`
- `POST /api/pratha/clients`
- `POST /api/pratha/leads/import`
- `POST /api/pratha/campaigns`
- `POST /api/pratha/campaigns/{id}/validate`
- `POST /api/pratha/campaigns/{id}/approve`
- `POST /api/pratha/campaigns/{id}/dispatch-mock`
- `GET /api/pratha/campaigns/{id}/report`

The gateway must authenticate using Avinash's platform session and authorize by tenant/client, then attach credentials **server-side** when forwarding to Pratha's independent staging service. Never put `MATRIX_EXEC_KEY` in HTML, JavaScript, public environment variables or the browser's storage. The existing shared administrator key is unacceptable for production. Ensure the gateway preserves error codes, rate limits requests, validates CSRF protections for state-changing actions and never forwards a browser-provided arbitrary URL.

The v0.3 API currently uses `X-Admin-Key` plus SQLite. Cross-client authorization and production identity integration require backend work and must not be implied by this frontend page.

## Safe manual demonstration
1. Open `app.html`, select **Campaign operations**.
2. Leave mode as **Demo**.
3. Register a test client (local simulation).
4. Load `synthetic_test_audience.csv` from Pratha v0.3, click Inspect CSV, then Import.
5. Enter campaign name, choose Email/WhatsApp, and approved synthetic message.
6. Create campaign, validate, approve **simulation**, execute mock, review report.
7. Refresh page and note that demo state is intentionally not persisted.

## Acceptance gates
- Frontend navigation and mobile layout operate correctly.
- No client contact data or API key is sent to third-party services during demo.
- Connected mode reports a clear failure without an authenticated gateway.
- Before connected rollout: independent backend test suite, authentication, tenant isolation, CSRF, persistence, suppression, and campaign-specific audience snapshot tests.
- Before public use: human authorization, data protection review and provider rules.

## Ownership
Pratha: independent campaign service and API contracts.
Avinash: SaaS authentication, secure gateway, platform persistence, production infrastructure.
Director: live campaign, data access and commercial approval.

## Deployment
This branch can be reviewed and previewed with Vercel, but **do not merge connected mode into a public release as functioning** until Avinash has implemented and verified an authenticated gateway. It is a navigation and frontend integration readiness change, not completed end-to-end SaaS integration.
