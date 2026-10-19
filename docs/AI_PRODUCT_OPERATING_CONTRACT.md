# Matrix 360 — AI Product Operating Contract v1
**Director-sponsored | 20 October 2026 | Review-only engineering governance**

**Authority and precedence:** [Director control #20](https://github.com/Matrix360repo/matrix360_frontend/issues/20) controls immediate release acceptance and authorization; [Director product-gap review #27](https://github.com/Matrix360repo/matrix360_frontend/issues/27) controls the phased capability backlog. A repository's `AGENTS.md` specifies its local safety rules and responsible engineer. This contract aligns AI sessions; it does **not** give an AI assistant permission to merge or deploy production, incur costs, access restricted data, contact customers, or integrate independent engines.

## One shared product outcome, not four utilities

A nontechnical customer signs into an authorized business and states a real commercial objective in ordinary language. Matrix 360 must then guide the customer through:

1. **Business context:** known tenant identity; custom industry and business base; distinct target markets; approved offers, positioning, languages and constraints. Do not hardcode the three pilot companies as a product limit.
2. **Research:** source-cited market/competitive observations; transparent gaps/uncertainty. Do not imply that LinkedIn/profile crawling and comments/DMs are freely authorized.
3. **Audience:** explainable targeting, legal/authorized source records, schema/field provenance, company deduplication, validation and enrichment distinguished from consent; unknown fields remain unknown.
4. **Plan:** customer-editable suggested sequence; channels, KPIs, calendar, budgets/bounds, available services, dependencies, uncertainties and the exact approvals required. Model output cannot grant permission.
5. **Creative:** content aligned with the researched business and approved brand; truthful images/reels. FFmpeg animation of approved assets is a valid motion-graphic reel, not cinematic text-to-video.
6. **Review and calendar:** choose draft assets, dates and channels, prove permissions, approve frozen versions and verify whether provider integration is available. Do not publish or send implicitly.
7. **Execution and learning:** only after authorized provider/channel approval, execute a resumable, idempotent task with auditable side-effects; record actual receipts, not assumed delivery or simulated engagement; suggest optimization with evidence rather than buying ads.

**North-star synthetic trial:** a new manufacturing business in an arbitrary industry/location (not preconfigured pilot names) can ask, "Find relevant buyers in my target market, explain the sources and quality limits, propose LinkedIn and email content, prepare a 7-day content calendar and a budget within my limit. Nothing should be sent or charged without my approval." The customer sees a real, verifiable available action or an honest blocked/simulated state at each step. Repeat with a residential client.

## Workstream contracts (preserve current independence)

| Owner | Product accountability | Evidence owed | Outside current permission |
| --- | --- | --- | --- |
| Avinash (frontend + CRM) | One coherent, accessible, mobile-friendly business journey; authenticated tenant identity; reviewed goal-to-plan; capability/status cards; proposals for positioning, budget, research and calendar; **owns orchestration architecture decision record** | Unassisted user path, screenshots/video, two synthetic tenants, auth/lead CRUD/tenant negatives, honest plan states and cost-gate UX | Cannot claim missing modules are live; no staging dynamic-onboarding regression, autonomous ad spending, production merge or new engine coupling |
| Mayur | Independent audience sourcing **capability evaluation**, schema-aware ingestion, lawful source-provenance, enrichment feasibility, validated identity/contact/location, client-fit reason codes and reconciled export | Synthetic 100-row and large-file benchmarks with checksums; source/validation/consent distinctions, unknowns, optional paid source matrix; signed-interface contract | Not a universal scraper, a verified-contact seller or Pratha executor; no unauthorised real data or third-party enrichment spend |
| Tanmayi | Independent research-to-brief and brand-governed images, genuine 9:16 reel/media options, calendar/publishing *capability assessment*, draft/post review | Approved asset provenance and quality, decoded frames+audio of MP4, source/license, FFmpeg/stock/open-model/API comparison and blockers, provider budget guard | No invented AI footage, stock-license assumptions, unapproved credit calls, LinkedIn cold auto-comments/DMs, or real publication |
| Pratha | Independent approved campaign readiness: import/qualification, channel permissions/consent, suppression, frozen audience/content, durable scheduled simulation, auditable outcomes | Synthetic import-to-audit, tenant denied tests, state-machine/recovery logs, proposed versioned interface for future authorized orchestration | No real sending, ambiguous success labels, direct Mayur/Tanmayi coupling, or new provider identity without permission |

**Interface boundaries:** share versioned synthetic schema and OpenAPI contracts through PR review. Discuss inputs/outputs/status/authorization in GitHub; **do not implement cross-engine runtime linkage** without explicit Director approval. CRM authenticated identity and role checks are authoritative. No model-generated SQL or inferred contact consent.

## AI session contract — required at start of every engineering session

1. **Read:** repo `AGENTS.md`; [central control #20](https://github.com/Matrix360repo/matrix360_frontend/issues/20); [product scope #27](https://github.com/Matrix360repo/matrix360_frontend/issues/27); own active P0 issue; active PRs, staging SHA and deployment. Never assume the default branch is the current version.
2. **Acknowledge once per material assignment** in the owner's issue: `ACCEPTED | customer outcome | exact test | constraints | next deliverable`. If requirements contradict verified code, document the conflict and propose the smallest safe choice.
3. **Before coding:** identify the particular customer friction this change fixes; mark current capability `VERIFIED / SIMULATED / CONFIG_REQUIRED / BLOCKED / NOT_TESTED`; name success metric and regression risk. Avoid duplicating an active PR.
4. **Choose smallest independently executable change:** one tested customer-visible step, no feature deletion or rewrites, narrow draft branch/PR, no changes to other repositories by assumption.
5. **Run and record:** unit+regression, browser mobile/desktop for UI, tenant negative/security, synthetic authorized data only, audit/idempotency for stateful steps, output quality/provenance for media and audience. A green CI alone is not an end-to-end acceptance.
6. **Close the feedback loop:** post exact SHA, PR, reproduction/test commands, artifacts, failures/unknowns, rollback, what user can do, next blocker, and whether Director action is actually required. Product owner Avinash coordinates UX independently of authority over the other engines.

Do **not** claim completion percentages as acceptance or infer staff hours from AI sessions. Avoid generating a new design document if an existing PR already implements the requirement; verify/repair it.

## Canonical handoff payload between coding AIs

```text
Workstream / owner / issue / PR / exact SHA:
Business user outcome and persona:
Problem observed and prior working behavior to preserve:
Inputs and business provenance / privacy class:
Expected output and honest state (VERIFIED, SIMULATED, CONFIG_REQUIRED, BLOCKED, NOT_TESTED):
API/schema contract version (NO runtime integration unless approved):
Security, tenant and spend/approval boundaries:
Acceptance test (repro steps + positive AND negative):
Customer-visible evidence (link/screenshots/video + what it proves):
Open dependency and requesting owner:
Next independently safe change:
Director decision needed? (only cost, production, customer messages, sensitive transfers, major architecture):
```

**Receiving owner:** respond `ACCEPT / CONFLICT / NEED CONTRACT` in GitHub, link the acceptance test; do not build silently from a chat-only assumption. Product Controller surfaces conflicting or unanswered dependencies centrally rather than merging workstreams.

## Capability and cost routing

| Capability | Default choice | Upgrade decision |
| --- | --- | --- |
| Market research / prospect enrichment | Permitted public/authorized sources + deterministic normalization + cited uncertainty | Paid enrichment only after provider terms, credit cost, value and data-transfer approval |
| 9:16 reels | Reuse existing FFmpeg motion graphics and approved photos, licensed footage with source records | Locally available GPU open-weight models only if feasible/licensed; paid video API requires approved cap |
| Workflow orchestration | Keep existing durable workers and API controls; design a connector abstraction | Compare n8n internal-use licensing, Activepieces community and bespoke queue for SaaS customer workflows before infrastructure |
| LinkedIn / social | Research from permitted sources; approved drafts and content calendar; Page APIs after appropriate OAuth | No unsolicited automated personal DMs, comments or unauthorized scraping; permissions must be verified |
| Budget / optimization | Explicit budget limits, evidence-based assumptions, **review-only** allocation and KPIs | No real ad spend / automatic reallocation without separate approval and verified channel integrations |

## Release gates, sequencing and measurement

**22 Oct 2026 — Pilot usability gate (P0).** Verified per-workstream synthetic proof for sign-in→business→goal→plan; audience explanation/export, campaign simulation, truthful media and fallback, responsive frontend. Distinguish demonstrations from real connected services. Zero regression to existing CRM and verified workflows.

**25 Oct — controlled client pilot** only if Director accepts security, operational limits, content truth and contact safety. No forced release.

**14 Nov — validated commercial MVP (P1):** researched business brief and cited sources, extensible industry/geography, evidence-backed targeting/enrichment decisions, 7-day calendar, brand-governed reel/content path, channel review and approval, orchestration design validated and implemented *only to separately authorized interfaces*; no invented analytics.

**15 Dec — public SaaS release:** allowed integrations, compliant consent/permissions, scalable costs, tenant safety, audit/backup/observability and genuine outcome tracking with operational sign-off.

Measure: independent unassisted task completion, time to first verifiable value, tenant negative-test pass, output-quality approval, traceable sources, provider success where real, recoverability, rollback, zero unauthorized expense/send. Do not rank staff by arbitrary percentage or lines of code.

## Decision and escalation register

Escalate **only** spend/new subscriptions, production release, real customer messages/posts/ad purchases, sensitive transfers, new external account consent, and major established architecture/runtimes. Routine code decisions and tests belong to team+AI. Record approvals in GitHub with scope and expiration. Silence is not approval.

## Communication semantics

- **Director → GitHub:** Director communicates outcomes and concerns; product owner turns them into testable GitHub issues.
- **GitHub → coding AI:** every AI developer session must pull `AGENTS.md` and current owner issue. GitHub cannot inject instructions into an already-running independent ChatGPT conversation.
- **Team → Director:** evidence-backed blocker and outcome updates through issues/PRs. Periodic automated checking is a reminder and routing mechanism, not proof a person or AI read a comment.
- **No duplicate work:** cite an active PR and reconcile before starting another branch. If multiple AI agents touch one file, allocate explicit ownership and sequence reviews.

This contract is a human/AI working agreement, not a deployed autonomous orchestration engine.
