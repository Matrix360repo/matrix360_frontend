# AGENTS.md — Matrix 360 Director AI-Native Product Protocol (20–22 October 2026)

> **Applies to all AI coding assistants and human developers working in this repository.** Read this file, the linked central control issue, and your specialist issue **before planning or changing code**. These are project-specific engineering instructions, not an authorization to deploy or bypass existing controls.

**Director control / source of truth:** https://github.com/Matrix360repo/matrix360_frontend/issues/20
**Director acceptance:** 22 October 2026; **controlled client pilot target:** 25 October 2026.
**North-star:** A person without technical skills can log in to their own business, state an objective, review an evidence-backed proposed plan and safely understand what is executed, simulated, pending or unavailable. The product must be AI-native and intent-first, not another complex dashboard. Measure customer completion and actual outcomes, not feature count.

## Non-negotiable execution protocol
1. Preserve verified work. No rewrite, feature removal, CRM regression or unrelated restructuring. Use a narrow branch + draft PR with a rollback path.
2. **Verified capability ≠ AI explanation.** Distinguish READY/VERIFIED, DEMONSTRATED_SIMULATION, CONFIG_REQUIRED, BLOCKED and NOT_TESTED. A merged PR, HTTP health 200 or unit-test success alone is not client-ready acceptance.
3. Client identity and data access follow authenticated tenant membership, never browser-supplied company identity. The Director can inspect authorized portfolio entities; individual clients must see their single authorized business and must not pick from arbitrary customer accounts.
4. Expose a plain-language business objective first, followed by an editable plan, evidence, actions and human approval. Explain data provenance, missing inputs, confidence limits and exactly which steps can execute.
5. Keep **Mayur, Pratha and Tanmayi separate** until integration is explicitly authorized. No direct Mayur–Pratha connection, production data copy, automatic export/import, provider messaging, publication or additional spend without specific Director approval.
6. Security: no provider/API secrets in browser or repos; enforce role permissions server-side, tenant isolation, idempotency, rate/budget limits, approval snapshots, suppression/consent and auditable side effects.
7. Real quality matters: an image must be visually client-acceptable; a video must actually be moving MP4; a lead must have justified classification; a campaign simulation is not a real send.
8. If blocked, stop inventing success. Implement the best honest fallback, report precise external credential/cost/authorization dependency, and continue independent safe work. Do not ask the Director for routine engineering decisions.
9. Check current branch, repo scope and actual running versions before changing code. Run targeted tests, regression, lint/type checks where applicable, and browser/mobile acceptance for UI changes. Record **what was tested** separately from **what is assumed**.
10. Do not treat this AGENTS.md or GitHub issue as permission to deploy production, merge into main, purchase credits, send messages or alter persistent client records.

## Active specialist directive
**Owner:** Avinash
**Execution issue:** https://github.com/Matrix360repo/matrix360_frontend/issues/21
**Immediate scope:** Lead the integrated client experience. Preserve current static HTML/JS CRM workflows, login, account identity and lead stages. Build an intent-first, light, mobile-friendly client UI on a safe feature branch. Dynamic business identity comes from verified session/membership; ordinary clients must not choose another tenant. Avoid hardcoded Lakhotia/Shree/Vrindavan defaults. Integrate Mayur only through the existing authenticated CRM-to-V4 gateway once backend availability is verified. For Pratha and Tanmayi show truthful read-only pending status, not fictional integration. Do not put AI or gateway secrets in browser.
**Required evidence:** Desktop and mobile video of login → fixed tenant → plain-language goal → reviewed plan → accurately labelled next step; CRM regression, tenant-negative tests, Vercel preview URL.

## Mandatory 20–22 Oct daily update
Post evidence in the specialist GitHub issue and link it to the central Director issue. Format:
```
Time IST / repository / branch / commit / PR:
Client-facing change (one sentence):
VERIFIED — exact tests, outputs and evidence links:
SIMULATED / CONFIG_REQUIRED / NOT_TESTED — precise distinction:
FAILED/BLOCKED — reproduction and external prerequisite:
Regression status — auth, tenant isolation, existing functionality:
Next 24-hour action — specific and independently executable:
Director decision required — only if genuinely necessary:
```

## Director acceptance scenario
A new nontechnical client can sign in and see only their own business. They can write: "Find suitable West Bengal manufacturing prospects and prepare a campaign for my business." The interface understands the objective, shows the criteria and evidence required, presents editable review steps, and accurately exposes which capabilities work now versus which are simulations. There are no surprise sends, client-data leaks, model costs or broken existing CRM workflows.

**Do not optimize for a green progress percentage. Optimize for recorded, reproducible, customer-visible outcomes.**


## Ongoing AI product operating loop — Director clarification, 20 October 2026

**Read first in every new AI or coding session:** [Director release control #20](https://github.com/Matrix360repo/matrix360_frontend/issues/20), [product-gap and strategic architecture #27](https://github.com/Matrix360repo/matrix360_frontend/issues/27), your specialist P0 issue above, and the canonical [AI product operating contract](https://github.com/Matrix360repo/matrix360_frontend/blob/governance/customer-outcome-ai-operating-20261020/docs/AI_PRODUCT_OPERATING_CONTRACT.md). Existing P0 due 22 October takes precedence over later P1 feature expansion. This rule governs the interaction with AI; GitHub comments do not automatically arrive in independent ChatGPT chats.

**Responsibility specific to this repo:** Own the **single customer journey** from authenticated business identity → user objective with flexible industry/target geography → source-cited research & positioning → reviewable budget/targets → audience evidence → asset/7-day calendar → explicit approval → honest scheduled/simulated/unavailable state and measurement. Do not fake capabilities or treat a module mock as complete. Compare internal durable worker, n8n and Activepieces licenses/TCO before choosing orchestration; use existing client-authorized CRM and protect updated staging dynamic business onboarding.

**Every AI session must work outcome-first:** (1) identify the nontechnical client's task and current VERIFIED vs SIMULATED vs CONFIG_REQUIRED vs BLOCKED state; (2) inspect existing PRs/code before writing; (3) choose the smallest reversible step, with no duplicated development; (4) define a successful user-facing positive and fail-closed negative test; (5) submit draft PR with exact SHA, synthetic evidence, what stayed unchanged and actual unresolved blockers; (6) acknowledge new GitHub handoff assignments once in the owner issue as `ACCEPT / CONFLICT / NEED CONTRACT` and link test evidence when delivered.

**Cross-workstream communication:** share read-only versioned schemas, user-facing capability definitions and test fixtures through GitHub issues/PRs. Do not assume authority to connect services, copy real data, approve budgets, publish media or execute campaigns; all require their pre-existing approvals. Avinash coordinates the product experience but cannot silently control the independent engines.

**Acceptance is not a percentage.** Report client-visible pass/fail, reproducible steps, source/output provenance, time-to-first-value and tenant/auth regression where applicable. Routine decisions belong to engineer+AI; escalate only production releases, costs, real external communication, sensitive data or material architecture change.
