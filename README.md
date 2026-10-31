# Matrix360 showcase

The current Matrix360 application replaces the earlier static prototype. Node 24 is required; no runtime npm dependencies are needed. Vercel builds from this repository root using `vercel.json`.

## Showcase and normal login

Set `M360_SHOWCASE_ENABLED=true` in Vercel **Production**, then deploy. `/login.html` opens the isolated fictional workspace without credentials. Demo leads and profile edits stay in each browser's session storage. The banner identifies fictional data. AI generation, scraping, uploads and publishing are disabled in this mode.

To restore normal login, set the flag to `false` or remove it and redeploy. The synthetic demo session is cleared; real authentication and workspace membership checks remain required. Never expose a real workspace through an anonymous credential.

## Checks

Run `npm test` on Node 24. Tests mock external services; they do not prove live generation, scraping or provider cancellation. No real client records or provider secrets are included in this repository. The website workspace map is empty; configure any owner-approved authenticated mapping privately before enabling live discovery.

Keep `.env.local`, `.vercel`, private data, credentials and logs out of Git. Production showcase mode needs only the showcase flag. Refer to `.env.example` for optional authenticated integrations; do not enable paid or publication gates without separate authorization.

Application paths: `api/` contains the 12 Vercel handlers, `lib/` contains shared handlers and browser adapters, and `frontend-source/` contains served assets. `data/` is excluded; historical marketing cache records are not part of this release.
