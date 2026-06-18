# Multi-Agent Feature Pipeline — Design Spec

- **Date:** 2026-06-19
- **Status:** Approved (design); pending implementation plan
- **Author:** gwoks + Claude
- **Topic:** A reusable, bd-aware multi-agent pipeline that turns a feature prompt into a designed, built, and QA-verified implementation.

---

## 1. Overview

We are building a **reusable multi-agent development pipeline** for this repository. Given a single feature prompt, the pipeline coordinates seven specialist subagents through two phases — **Design** and **Build** — with one human approval gate between them, and tracks all work in the project's beads (bd) issue tracker.

The pipeline is generic: the link shortener (separately scoped) is simply its first run. Future features reuse the same agents and workflow.

### Goals

- Encode a repeatable PM → UX/design/architecture → build → QA flow as deterministic orchestration.
- Keep a human in control at the meaningful checkpoint (design sign-off) without blocking the autonomous build/QA loop.
- Track every run in bd as an epic with per-stage child issues.
- Make each agent a small, focused, independently-understandable unit.

### Non-goals (v1)

- Parallel frontend/backend execution in isolated worktrees (deferred; v1 is sequential).
- Pausing the workflow mid-run for live human input (not possible for a background workflow; handled via the gate + assumption-logging instead).
- A GUI/visual layer for the pipeline. It is invoked via the `Workflow` tool.
- Multi-feature concurrency (one feature run at a time in v1).

---

## 2. Deliverables

1. **Seven subagent definitions** in `.claude/agents/`:
   `product-manager.md`, `ux-researcher.md`, `designer.md`, `system-architect.md`, `frontend-engineer.md`, `backend-engineer.md`, `qa-engineer.md`.
2. **One reusable workflow** in `.claude/workflows/feature-pipeline.js`, parameterized by `args`, with `design` and `build` phases.
3. **This spec** in `docs/superpowers/specs/`.
4. **Per-run feature docs** written by the pipeline to `docs/features/<slug>/`.

---

## 3. Agent roster

Each agent has one clear purpose, a well-defined input/output contract, and scoped tools.

| Agent | Purpose | Inputs | Outputs | Tools |
|---|---|---|---|---|
| **product-manager** | Define requirements, scope, MVP cut, acceptance criteria | feature prompt; specialist feedback | `PRD.md`; structured assumptions + open-questions list | Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch |
| **ux-researcher** | User journeys, flows, screen states, empty/error/loading states, a11y | PRD / brief | `USER-JOURNEY.md`; UX feedback | Read, Write, Edit, Grep, Glob, Bash |
| **designer** | Visual design system, tokens (color/type/spacing), component inventory, layout/wireframe descriptions for a polished UI | PRD / brief; user journey | `DESIGN.md`; design feedback | Read, Write, Edit, Grep, Glob, Bash |
| **system-architect** | Stack, data model, API contracts, hot-path/scale, security, multi-tenancy, deployment | PRD / brief | `ARCHITECTURE.md`; technical feedback | Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch |
| **frontend-engineer** | Implement the frontend per design + journey + architecture | all design docs; QA fix-list | frontend code; build/lint passing | Read, Write, Edit, Grep, Glob, Bash |
| **backend-engineer** | Implement the backend per architecture + PRD | all design docs; QA fix-list | backend code; tests passing | Read, Write, Edit, Grep, Glob, Bash |
| **qa-engineer** | Verify implementation against acceptance criteria + design fidelity | all docs; built code | `QA-REPORT.md`; structured pass/fail verdict | Read, Grep, Glob, Bash, Write (no code edits) |

**Shared agent directives** (in every system prompt):
- Stay strictly within your role; do not do another agent's job.
- Follow `AGENTS.md`: always use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `-y`, etc.).
- Read the relevant `docs/features/<slug>/` artifacts before acting.
- Your final message **is** your return value (raw data/structured output), not a human-facing chat message.

---

## 4. Workflow architecture

The workflow is **one script** with a `phase` switch in `args`, invoked twice with the human gate between.

### 4.1 Phase `design`

```
prompt
  └─ bd-sync: create epic + 7 child issues (+ deps); return id map        [serialized]
  └─ PM drafts a brief (goals, scope, key questions)
       └─ DISCUSSION round (parallel): ux-researcher · designer · system-architect
            each reacts to the brief → {domainInput, concerns, openQuestions}
       └─ PM writes PRD.md  (synthesizes discussion; logs assumptions + open questions)
       └─ bd-sync: close prd issue                                         [serialized]
            └─ ARTIFACTS round (parallel): ux→USER-JOURNEY · designer→DESIGN · architect→ARCHITECTURE
                 (each reads the final PRD.md)
       └─ bd-sync: close journey/design/architecture issues                [serialized]
  ⇒ returns { slug, epicId, docPaths, assumptions[], openQuestions[] }
```

Rationale for **assumption-logging instead of mid-run pause:** a background workflow cannot stop for input. Agents therefore make reasonable assumptions, record each one, and produce complete artifacts. Everything uncertain surfaces at the gate.

### 4.2 Human gate (between phases)

The **main agent** (not the workflow) presents to the user:
- a short summary of each of the four docs, and
- the consolidated assumptions + open-questions list.

User responds:
- **Approve** → main agent invokes Phase `build`.
- **Answer / request changes** → main agent re-invokes Phase `design` with an `answers` field (or patches docs), then re-presents.

No build work begins until approval.

### 4.3 Phase `build`

```
read docs from docs/features/<slug>/
  └─ bd-sync: claim backend issue
  └─ backend-engineer implements        → bd-sync: close backend issue
  └─ bd-sync: claim frontend issue
  └─ frontend-engineer implements       → bd-sync: close frontend issue
  └─ QA LOOP (max 3 rounds):
       qa-engineer verifies → { pass, backendIssues[], frontendIssues[], notes }
         pass → close qa issue → DONE
         fail → route backendIssues→backend-engineer, frontendIssues→frontend-engineer
                then re-run qa-engineer
       (if still failing after 3 rounds: stop, report honestly, leave qa issue open)
  ⇒ returns { qaReport, iterations, passed }
```

**Decisions:**
- **Backend before frontend** (frontend consumes the API; QA needs a running backend). This intentionally deviates from the original "frontend first" sketch.
- **Sequential** backend/frontend in v1 (shared repo; avoids worktree-merge complexity). Parallel-in-worktrees is future work.
- **QA loop cap = 3.** On exhaustion the workflow stops and reports rather than looping; the qa issue stays open for human follow-up.

---

## 5. Invocation contract

```js
// Phase 1
Workflow("feature-pipeline", { prompt: "<feature description>", phase: "design", slug: "<kebab-slug>" })
// → { slug, epicId, docPaths, assumptions, openQuestions }

// (human gate)

// Phase 2
Workflow("feature-pipeline", { phase: "build", slug: "<kebab-slug>" })
// → { qaReport, iterations, passed }
```

- `slug` is generated by the main agent and passed in (workflow scripts cannot call `Date.now()`/`Math.random()`).
- `answers` (optional, Phase `design`): human responses to open questions for a re-run.
- Phase `build` reads all design docs from `docs/features/<slug>/` — no need to thread doc contents through args.

### Structured schemas (validated via `agent(..., {schema})`)

- **discussionFeedback**: `{ domainInput: string, concerns: string[], openQuestions: string[] }`
- **prdResult**: `{ summary: string, assumptions: string[], openQuestions: string[], acceptanceCriteria: string[] }`
- **qaVerdict**: `{ pass: boolean, backendIssues: string[], frontendIssues: string[], notes: string }`
- **bdIdMap**: `{ epicId: string, issues: { prd, journey, design, architecture, backend, frontend, qa: string } }`

---

## 6. bd integration

- Each run creates a bd **epic** titled `Build <feature>` with seven child issues: `prd`, `journey`, `design`, `architecture`, `backend`, `frontend`, `qa`.
- **Dependencies:** `journey`, `design`, `architecture` depend on `prd`; `backend` and `frontend` depend on `design` + `architecture`; `qa` depends on `backend` + `frontend`.
- Issues are claimed/closed as each stage completes.
- **Concurrency safety:** all bd state transitions are performed by **serialized `bd-sync` agent steps at phase boundaries**, never by the parallel role agents simultaneously. This avoids concurrent Dolt writes / lock contention. (A single Dolt writer at a time.)
- Building the pipeline itself is also tracked in bd (epic + issues for the agent files, the workflow, and the first run) per the project rule "issue before code."

---

## 7. File layout

```
.claude/agents/            product-manager.md, ux-researcher.md, designer.md,
                           system-architect.md, frontend-engineer.md,
                           backend-engineer.md, qa-engineer.md
.claude/workflows/         feature-pipeline.js
docs/superpowers/specs/    2026-06-19-multi-agent-dev-pipeline-design.md   (this file)
docs/features/<slug>/      PRD.md, USER-JOURNEY.md, DESIGN.md, ARCHITECTURE.md, QA-REPORT.md
```

---

## 8. Reliability & cost considerations

- **Assumption-logging** keeps the design phase non-blocking while surfacing uncertainty at the gate.
- **Serialized bd transitions** prevent Dolt lock contention from parallel agents.
- **QA loop cap (3)** prevents infinite fix loops; exhaustion is reported, not hidden.
- **Honest reporting:** if QA never passes, the workflow returns `passed: false` with the report — no false "done."
- **Scale:** a full run is roughly ~12 agents (Phase 1) + up to ~10 (Phase 2 with fix rounds). Token-intensive by design; the user has opted into running it on the shortener.

---

## 9. Acceptance criteria (for building this pipeline)

- [ ] Seven agent `.md` files exist in `.claude/agents/` with correct frontmatter (`name`, `description`, `tools`) and focused system prompts.
- [ ] `.claude/workflows/feature-pipeline.js` exists, parses, and begins with a valid pure-literal `meta` block.
- [ ] The workflow supports `phase: "design"` and `phase: "build"` via `args`.
- [ ] Phase `design` produces the four docs in `docs/features/<slug>/` and returns assumptions + open questions.
- [ ] Phase `build` runs backend → frontend → QA loop and returns a verdict.
- [ ] bd epic + 7 child issues are created with correct dependencies; state transitions are serialized.
- [ ] A successful first run on the link-shortener seed prompt reaches the design gate.

---

## 10. Open questions / future work

- Parallel frontend/backend builds via `isolation: "worktree"` + a merge step.
- Per-agent model/effort tuning (e.g., cheaper model for mechanical bd-sync steps).
- A second, lighter QA gate for visual/design fidelity using a browser/screenshot tool.
- Supporting multiple concurrent feature runs.

---

## Appendix A — First-run seed prompt (link shortener)

Captured from the initial brainstorming before the pivot. To be passed as the `prompt` for the first `design` run:

> Build a **public SaaS link shortener**. Multi-tenant with user accounts. Core: create short link → redirect (hot, high-traffic path). First-version features: **custom aliases**, **click analytics** (counts, timestamps, referrer, geo/device), **expiration & full link management** (CRUD, enable/disable, edit destination), and **QR codes** per link. Recommended backend stack: **Node + TypeScript (NestJS)** with a cache layer (Redis/in-memory) in front of the redirect lookup to keep the hot path fast. Frontend (dashboard) stack: to be decided during design.
