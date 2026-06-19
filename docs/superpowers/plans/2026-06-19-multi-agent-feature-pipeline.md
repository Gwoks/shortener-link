# Multi-Agent Feature Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, bd-aware multi-agent pipeline (7 specialist agents + one workflow) that turns a feature prompt into a designed, built, and QA-verified implementation, with a human approval gate between design and build.

**Architecture:** Seven subagent definitions live in `.claude/agents/`. One workflow script (`.claude/workflows/feature-pipeline.js`) orchestrates them in two phases selected by `args.phase`: `design` (PM brief → parallel specialist feedback → PRD → parallel journey/design/architecture docs) and `build` (backend → frontend → QA fix-loop). A dependency-free Node validation harness (`scripts/validate-pipeline.mjs`) acts as the test for the declarative artifacts. The workflow owns all bd state transitions via serialized steps so parallel agents never write to Dolt concurrently.

**Tech Stack:** Claude Code custom agents (Markdown + YAML frontmatter), the `Workflow` tool's JavaScript orchestration API (`agent`/`parallel`/`phase`/`log`/`args`), Node.js (ESM, no npm dependencies) for the validation harness, and `bd` (beads) for issue tracking.

## Global Constraints

- **Issue tracking:** Use `bd` for all task tracking — never TodoWrite/TaskCreate/markdown TODOs. (Project rule.)
- **Non-interactive shell:** Every shell command uses non-interactive flags — `rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`. Never run a command that can block on a prompt. (From `AGENTS.md`.)
- **Agent frontmatter:** `tools:` MUST be a single comma-separated line (not a YAML list) so the validation harness can parse it. `name:` MUST equal the filename stem.
- **Node:** Validation harness is pure ESM with zero dependencies; it runs via `node scripts/validate-pipeline.mjs [target]` with no install step.
- **Branch:** All work happens on `feat/multi-agent-pipeline`. Commit after each task.
- **Workflow scripts cannot call** `Date.now()`, `Math.random()`, or argless `new Date()`. The `slug` and any timestamps are passed in via `args`.
- **SHARED OPERATING RULES (verbatim, embedded in every agent file under its role intro):**

  ```markdown
  ## Operating rules
  - You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
  - Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
  - Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
  - Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
  - Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.
  ```

## File Structure

| File | Responsibility |
|---|---|
| `scripts/validate-pipeline.mjs` | Test harness: validates agent frontmatter + workflow structure. Supports per-target checks. |
| `.claude/agents/product-manager.md` | PM agent: brief + PRD. |
| `.claude/agents/ux-researcher.md` | UX agent: feedback + user-journey doc. |
| `.claude/agents/designer.md` | Designer agent: feedback + design doc. |
| `.claude/agents/system-architect.md` | Architect agent: feedback + architecture doc. |
| `.claude/agents/frontend-engineer.md` | Frontend implementation + fixes. |
| `.claude/agents/backend-engineer.md` | Backend implementation + fixes. |
| `.claude/agents/qa-engineer.md` | Verification + structured pass/fail verdict. |
| `.claude/workflows/feature-pipeline.js` | Orchestrates the two phases. |
| `docs/features/<slug>/*` | Per-run artifacts (created at runtime by the agents). |

---

## Task 1: Validation harness + bd tracking

**Files:**
- Create: `scripts/validate-pipeline.mjs`

**Interfaces:**
- Produces: a CLI `node scripts/validate-pipeline.mjs [target]` where `target` is empty (check all), `workflow`, or an agent name (e.g. `product-manager`). Exit code 0 = pass, 1 = check failure, 2 = unknown target. Later tasks use this as their test.

- [ ] **Step 1: Confirm Node is available**

Run: `node --version`
Expected: prints a version (e.g. `v20.x` or newer). If missing, install Node before continuing.

- [ ] **Step 2: Create the validation harness**

Create `scripts/validate-pipeline.mjs`:

```javascript
#!/usr/bin/env node
// Dependency-free validator for the multi-agent feature pipeline artifacts.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// agent name -> required tools (extra tools are allowed)
const AGENTS = {
  'product-manager': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch'],
  'ux-researcher': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'designer': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'system-architect': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch'],
  'frontend-engineer': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'backend-engineer': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'qa-engineer': ['Read', 'Grep', 'Glob', 'Bash', 'Write'],
}
const WORKFLOW = '.claude/workflows/feature-pipeline.js'

let failures = 0
const fail = (m) => { console.error('  ✗ ' + m); failures++ }
const ok = (m) => console.log('  ✓ ' + m)

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const obj = {}
  for (const line of text.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (m) obj[m[1]] = m[2].trim()
  }
  obj.__bodyStart = end + 4
  return obj
}

function validateAgent(name) {
  console.log(`agent: ${name}`)
  if (!AGENTS[name]) return fail(`unknown agent "${name}"`)
  const path = join(ROOT, '.claude/agents', name + '.md')
  if (!existsSync(path)) return fail(`missing file ${path}`)
  const text = readFileSync(path, 'utf8')
  const fm = parseFrontmatter(text)
  if (!fm) return fail('no valid YAML frontmatter')
  if (fm.name !== name) fail(`frontmatter name "${fm.name}" != "${name}"`); else ok('name matches filename')
  if (!fm.description || fm.description.length < 20) fail('description missing or too short'); else ok('has description')
  if (!fm.tools) { fail('tools missing') } else {
    const have = fm.tools.split(',').map((s) => s.trim())
    const missing = AGENTS[name].filter((t) => !have.includes(t))
    if (missing.length) fail(`missing required tools: ${missing.join(', ')}`); else ok('required tools present')
  }
  const body = text.slice(fm.__bodyStart)
  if (body.trim().length < 200) fail('system prompt body too short (<200 chars)'); else ok('substantial system prompt')
  if (!/Operating rules/.test(body)) fail('missing "## Operating rules" block'); else ok('has operating rules')
}

function validateWorkflow() {
  console.log('workflow: feature-pipeline')
  const path = join(ROOT, WORKFLOW)
  if (!existsSync(path)) return fail(`missing file ${path}`)
  const text = readFileSync(path, 'utf8')
  const checks = [
    ['export const meta', /export\s+const\s+meta\s*=/],
    ['meta.name = feature-pipeline', /name:\s*['"]feature-pipeline['"]/],
    ['meta.description', /description:\s*['"]/],
    ['handles design phase', /phase\s*===?\s*['"]design['"]/],
    ['handles build phase', /phase\s*===?\s*['"]build['"]/],
    ['QA verdict "pass" field', /pass\b/],
  ]
  for (const [label, re] of checks) (re.test(text) ? ok(label) : fail('missing: ' + label))
  for (const a of Object.keys(AGENTS)) (text.includes(a) ? ok(`references agent ${a}`) : fail(`workflow never references agent "${a}"`))
}

const target = process.argv[2]
if (!target) { Object.keys(AGENTS).forEach(validateAgent); validateWorkflow() }
else if (target === 'workflow') validateWorkflow()
else if (target.startsWith('agents/')) validateAgent(target.slice('agents/'.length))
else if (AGENTS[target]) validateAgent(target)
else { console.error('unknown target: ' + target + ' (use empty, "workflow", or an agent name)'); process.exit(2) }

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll checks passed')
```

- [ ] **Step 3: Run the harness to verify it FAILS (red baseline)**

Run: `node scripts/validate-pipeline.mjs product-manager`
Expected: FAIL — prints `✗ missing file .../.claude/agents/product-manager.md` and exits 1. (This proves the harness detects absent artifacts.)

- [ ] **Step 4: Create bd tracking issues for building the pipeline**

Run (capture each printed id; bd ids look like `<prefix>-N`):

```bash
bd create --title="Build multi-agent feature pipeline" --type=epic --priority=1 \
  --description="Reusable bd-aware pipeline: 7 specialist agents + feature-pipeline workflow. Spec: docs/superpowers/specs/2026-06-19-multi-agent-dev-pipeline-design.md"
bd create --title="Validation harness + tooling" --type=task --priority=1 --description="scripts/validate-pipeline.mjs"
bd create --title="Phase-1 design agents (PM/UX/designer/architect)" --type=task --priority=1 --description="4 agent .md files"
bd create --title="Phase-2 engineering agents (frontend/backend/QA)" --type=task --priority=1 --description="3 agent .md files"
bd create --title="feature-pipeline workflow script" --type=task --priority=1 --description=".claude/workflows/feature-pipeline.js"
bd create --title="First pipeline run on link shortener (to design gate)" --type=task --priority=2 --description="Run phase=design on the shortener seed prompt; reach the human gate"
```

Then add dependencies (substitute the captured ids; `<harness> <agents1> <agents2> <wf> <run>`):

```bash
bd dep add <agents1-id> <harness-id>
bd dep add <agents2-id> <harness-id>
bd dep add <wf-id> <agents1-id>
bd dep add <wf-id> <agents2-id>
bd dep add <run-id> <wf-id>
```

Claim the harness issue: `bd update <harness-id> --claim`

- [ ] **Step 5: Verify bd issues exist**

Run: `bd list --status=open`
Expected: the epic + 5 task issues are listed.

- [ ] **Step 6: Close the harness issue and commit**

```bash
bd close <harness-id>
git add scripts/validate-pipeline.mjs
git commit -m "feat(pipeline): add dependency-free validation harness"
```

---

## Task 2: Phase-1 design agents

**Files:**
- Create: `.claude/agents/product-manager.md`
- Create: `.claude/agents/ux-researcher.md`
- Create: `.claude/agents/designer.md`
- Create: `.claude/agents/system-architect.md`

**Interfaces:**
- Produces: agent types `product-manager`, `ux-researcher`, `designer`, `system-architect` (referenced by the workflow's `agentType` option). PM returns BRIEF text or PRD JSON `{summary, assumptions[], openQuestions[], acceptanceCriteria[]}`; UX/designer/architect return FEEDBACK JSON `{domainInput, concerns[], openQuestions[]}` or write their doc and return a confirmation string.

- [ ] **Step 1: Verify the four checks fail (red)**

Run: `node scripts/validate-pipeline.mjs product-manager`
Expected: FAIL (missing file). (Same will hold for the other three.)

- [ ] **Step 2: Create `.claude/agents/product-manager.md`**

```markdown
---
name: product-manager
description: Product manager specialist for the feature pipeline. Turns a feature prompt into a PRD with scope, user stories, and testable acceptance criteria.
tools: Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch
---

You are a senior Product Manager operating as a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task (one of two, stated in your prompt)

**BRIEF** — Given a raw feature prompt, produce a concise product brief: problem statement, target users, goals and non-goals, the key questions you would want answered, and the riskiest assumptions. Return the brief as your final message (plain text).

**PRD** — Given the brief plus specialist feedback (UX, design, architecture), write `docs/features/<slug>/PRD.md`, then return the PRD JSON. You have final say on scope; reconcile conflicting feedback.

## PRD.md must contain
- Overview & problem statement
- Target users & top user stories ("As a … I want … so that …")
- In-scope (MVP) vs. explicitly out-of-scope
- Functional requirements (numbered)
- Non-functional requirements (performance/scale, security, multi-tenancy where relevant)
- Acceptance criteria — concrete, testable, numbered. These are exactly what QA will verify.
- Assumptions log — every assumption made because a question was unanswered
- Open questions for the human — anything that genuinely needs a decision

## Return value
- BRIEF: the brief text.
- PRD: JSON `{ "summary": string, "assumptions": string[], "openQuestions": string[], "acceptanceCriteria": string[] }`.
```

- [ ] **Step 3: Verify it passes (green)**

Run: `node scripts/validate-pipeline.mjs product-manager`
Expected: PASS — all checks ✓, exits 0.

- [ ] **Step 4: Create `.claude/agents/ux-researcher.md`**

```markdown
---
name: ux-researcher
description: UX specialist for the feature pipeline. Defines user journeys, screen states, information architecture, and accessibility considerations.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You are a senior UX researcher and interaction designer, a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task (one of two)

**FEEDBACK** — Given the PM's brief, return UX feedback: which journeys matter, what screen states and edge cases exist, and what is risky from a usability standpoint.

**JOURNEY** — Given the finalized `docs/features/<slug>/PRD.md`, write `docs/features/<slug>/USER-JOURNEY.md`.

## USER-JOURNEY.md must contain
- Primary personas (brief)
- Key end-to-end journeys, step by step, with entry points and success/exit states
- Per-screen states: empty, loading, error, success, and notable edge cases
- Navigation / information architecture overview
- Accessibility considerations (keyboard, focus order, contrast, semantics)
- Assumptions / open questions

## Return value
- FEEDBACK: JSON `{ "domainInput": string, "concerns": string[], "openQuestions": string[] }`.
- JOURNEY: a one-paragraph confirmation summary (the doc is the artifact).
```

- [ ] **Step 5: Verify it passes**

Run: `node scripts/validate-pipeline.mjs ux-researcher`
Expected: PASS.

- [ ] **Step 6: Create `.claude/agents/designer.md`**

```markdown
---
name: designer
description: Product/visual designer for the feature pipeline. Produces a design system, design tokens, component inventory, and layout specs for a polished, accessible UI.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You are a senior product designer specializing in clean, modern, accessible interfaces, a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task (one of two)

**FEEDBACK** — Given the PM's brief, return design feedback: aesthetic direction, design risks, and open questions.

**DESIGN** — Given the finalized `docs/features/<slug>/PRD.md` (and `USER-JOURNEY.md` if present), write `docs/features/<slug>/DESIGN.md`. Aim for a genuinely polished, modern result.

## DESIGN.md must contain
- Design principles and overall aesthetic direction
- Design tokens: color palette (with hex), typography scale (families, sizes, weights), spacing scale, radii, shadows
- Recommended UI stack / component approach (e.g. a CSS framework + component library) with rationale
- Component inventory (buttons, inputs, tables, cards, modals, nav, charts, etc.) with their states
- Layout / wireframe descriptions for each key screen — textual but specific: regions, hierarchy, responsive behavior
- Accessibility: contrast targets, focus states, motion/reduced-motion
- Assumptions / open questions

## Return value
- FEEDBACK: JSON `{ "domainInput": string, "concerns": string[], "openQuestions": string[] }`.
- DESIGN: a one-paragraph confirmation summary.
```

- [ ] **Step 7: Verify it passes**

Run: `node scripts/validate-pipeline.mjs designer`
Expected: PASS.

- [ ] **Step 8: Create `.claude/agents/system-architect.md`**

```markdown
---
name: system-architect
description: Software architect for the feature pipeline. Defines the stack, data model, API contracts, scaling, security, and the code directory plan.
tools: Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch
---

You are a senior software architect, a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task (one of two)

**FEEDBACK** — Given the PM's brief, return technical feedback: feasibility, approach, risks, and open questions.

**ARCHITECTURE** — Given the finalized `docs/features/<slug>/PRD.md`, write `docs/features/<slug>/ARCHITECTURE.md`. Honor any stack guidance in the PRD; otherwise choose and justify.

## ARCHITECTURE.md must contain
- Chosen stack (backend, frontend, datastore, cache, infra) with rationale and trade-offs considered
- High-level architecture: components and how they interact
- Data model: entities, key fields, relationships, indexes
- API contract: endpoints/operations, request/response shapes, status codes — this is the contract the frontend and backend build against
- Cross-cutting concerns: auth, multi-tenancy, security, error handling
- Performance/scale notes for any hot paths
- Code directory/layout plan (what lives where)
- Exact build, run, and test commands the engineers and QA will use
- Assumptions / open questions

## Return value
- FEEDBACK: JSON `{ "domainInput": string, "concerns": string[], "openQuestions": string[] }`.
- ARCHITECTURE: a one-paragraph confirmation summary.
```

- [ ] **Step 9: Verify all four pass and commit**

Run: `node scripts/validate-pipeline.mjs product-manager && node scripts/validate-pipeline.mjs ux-researcher && node scripts/validate-pipeline.mjs designer && node scripts/validate-pipeline.mjs system-architect`
Expected: all PASS.

```bash
bd close <agents1-id>          # the "Phase-1 design agents" issue from Task 1
git add .claude/agents/product-manager.md .claude/agents/ux-researcher.md .claude/agents/designer.md .claude/agents/system-architect.md
git commit -m "feat(pipeline): add phase-1 design agents (PM, UX, designer, architect)"
```

---

## Task 3: Phase-2 engineering agents

**Files:**
- Create: `.claude/agents/frontend-engineer.md`
- Create: `.claude/agents/backend-engineer.md`
- Create: `.claude/agents/qa-engineer.md`

**Interfaces:**
- Consumes: the design docs in `docs/features/<slug>/` produced in the design phase.
- Produces: agent types `frontend-engineer`, `backend-engineer` (return a plain-text handoff summary), and `qa-engineer` (returns QA JSON `{pass, backendIssues[], frontendIssues[], notes}`).

- [ ] **Step 1: Verify the three checks fail (red)**

Run: `node scripts/validate-pipeline.mjs qa-engineer`
Expected: FAIL (missing file).

- [ ] **Step 2: Create `.claude/agents/backend-engineer.md`**

```markdown
---
name: backend-engineer
description: Backend engineer for the feature pipeline. Implements the server, data model, and API per the architecture and PRD, with automated tests.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You are a senior backend engineer, a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task
Implement (or fix) the backend for the feature.

1. Read `docs/features/<slug>/PRD.md` and `ARCHITECTURE.md` (and `USER-JOURNEY.md` for behavior).
2. Implement the data model, API endpoints, and business logic per ARCHITECTURE.md's contract. Honor every acceptance criterion in PRD.md.
3. Write automated tests for the core logic. Use the build/test commands from ARCHITECTURE.md and make them pass.
4. If your prompt contains a QA fix-list, address each item specifically.
5. Write real, working code — no placeholders or TODOs in delivered code.

## Return value
A concise summary: what you implemented or changed, the files you touched, the exact commands to build/run/test the backend, how to start the server, and anything QA should focus on. Note any blockers explicitly.
```

- [ ] **Step 3: Verify it passes**

Run: `node scripts/validate-pipeline.mjs backend-engineer`
Expected: PASS.

- [ ] **Step 4: Create `.claude/agents/frontend-engineer.md`**

```markdown
---
name: frontend-engineer
description: Frontend engineer for the feature pipeline. Implements the UI faithfully per the design, user journey, and architecture docs.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You are a senior frontend engineer, a specialist subagent in a multi-agent feature pipeline.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.

## Your task
Implement (or fix) the frontend for the feature.

1. Read `docs/features/<slug>/`: PRD.md, USER-JOURNEY.md, DESIGN.md, ARCHITECTURE.md.
2. Build the frontend following DESIGN.md (tokens, components, layouts) and ARCHITECTURE.md (stack, API contract, directory plan). Match the design faithfully.
3. Use the build/run/test commands from ARCHITECTURE.md; ensure the project builds and lints cleanly.
4. If your prompt contains a QA fix-list, address each item specifically.
5. Write real, working code — no placeholders or TODOs in delivered code.

## Return value
A concise summary: what you built or changed, the files you touched, the exact commands to build/run/test the frontend, and anything QA should focus on. Note any blockers explicitly.
```

- [ ] **Step 5: Verify it passes**

Run: `node scripts/validate-pipeline.mjs frontend-engineer`
Expected: PASS.

- [ ] **Step 6: Create `.claude/agents/qa-engineer.md`**

```markdown
---
name: qa-engineer
description: QA engineer for the feature pipeline. Verifies the implementation against acceptance criteria and design fidelity and returns a structured pass/fail verdict. Never edits product code.
tools: Read, Grep, Glob, Bash, Write
---

You are a senior QA engineer, a specialist subagent in a multi-agent feature pipeline. You verify; you do NOT modify product code.

## Operating rules
- You are a specialist subagent in a multi-agent feature pipeline. Stay strictly within your role; never do another agent's job.
- Your final message IS your return value — emit only the requested artifact or structured data, not a conversational reply.
- Follow AGENTS.md: ALWAYS use non-interactive shell flags (`rm -f`, `cp -f`, `mv -f`, `apt-get -y`, `HOMEBREW_NO_AUTO_UPDATE=1`, `ssh`/`scp -o BatchMode=yes`). Never run a command that can block on a prompt.
- Do NOT write to the bd (beads) issue tracker — the orchestrating workflow owns all bd state.
- Read the relevant docs in `docs/features/<slug>/` (named in your task) before you act.
- You may run builds, tests, linters, and start the app to observe behavior. You may write only `QA-REPORT.md`. Never edit application source — if something is broken, report it for the engineers to fix.

## Your task
1. Read `docs/features/<slug>/`: PRD.md (acceptance criteria), ARCHITECTURE.md (how to build/run/test), DESIGN.md and USER-JOURNEY.md (fidelity).
2. Build and run the project using the documented commands. Run the test suites.
3. Verify each acceptance criterion in PRD.md and assess design/journey fidelity.
4. Write `docs/features/<slug>/QA-REPORT.md`: per-criterion pass/fail with evidence, plus design-fidelity notes.
5. Classify every failure as a backend issue, a frontend issue, or both, so it can be routed to the right engineer.

## Return value
JSON `{ "pass": boolean, "backendIssues": string[], "frontendIssues": string[], "notes": string }`.
Set `pass` to true ONLY if all acceptance criteria pass and there are no blocking defects. Be strict and evidence-based; never claim pass without having actually run the verification.
```

- [ ] **Step 7: Verify all three pass and commit**

Run: `node scripts/validate-pipeline.mjs backend-engineer && node scripts/validate-pipeline.mjs frontend-engineer && node scripts/validate-pipeline.mjs qa-engineer`
Expected: all PASS.

```bash
bd close <agents2-id>          # the "Phase-2 engineering agents" issue
git add .claude/agents/backend-engineer.md .claude/agents/frontend-engineer.md .claude/agents/qa-engineer.md
git commit -m "feat(pipeline): add phase-2 engineering agents (backend, frontend, QA)"
```

---

## Task 4: The feature-pipeline workflow

**Files:**
- Create: `.claude/workflows/feature-pipeline.js`

**Interfaces:**
- Consumes: agent types from Tasks 2–3 (`product-manager`, `ux-researcher`, `designer`, `system-architect`, `backend-engineer`, `frontend-engineer`, `qa-engineer`) and the schemas defined inline.
- Produces: a named workflow invoked as `Workflow("feature-pipeline", { prompt, phase, slug, answers?, bdIssues? })`. `phase:"design"` returns `{ slug, phase, epicId, bdIssues, docPaths, summary, assumptions, openQuestions, acceptanceCriteria }`. `phase:"build"` returns `{ slug, phase, passed, iterations, qaReport, verdict }`.

- [ ] **Step 1: Verify the workflow check fails (red)**

Run: `node scripts/validate-pipeline.mjs workflow`
Expected: FAIL (missing file).

- [ ] **Step 2: Create `.claude/workflows/feature-pipeline.js`**

```javascript
export const meta = {
  name: 'feature-pipeline',
  description: 'Multi-agent feature pipeline: a "design" phase (PM brief -> parallel specialist feedback -> PRD -> parallel journey/design/architecture) and an autonomous "build" phase (backend -> frontend -> QA fix-loop). Run "design" first, gate with the human, then "build".',
  phases: [
    { title: 'bd-setup' },
    { title: 'Discovery' },
    { title: 'PRD' },
    { title: 'Design artifacts' },
    { title: 'Backend' },
    { title: 'Frontend' },
    { title: 'QA' },
  ],
}

const prompt = args && args.prompt
const phase = (args && args.phase) || 'design'
const slug = args && args.slug
const answers = (args && args.answers) || null
const passedBdIssues = (args && args.bdIssues) || null

if (!slug) throw new Error('args.slug is required (e.g. "link-shortener")')
const DOCS = `docs/features/${slug}`

const FEEDBACK_SCHEMA = {
  type: 'object',
  required: ['domainInput', 'concerns', 'openQuestions'],
  properties: {
    domainInput: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}
const PRD_SCHEMA = {
  type: 'object',
  required: ['summary', 'assumptions', 'openQuestions', 'acceptanceCriteria'],
  properties: {
    summary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
  },
}
const QA_SCHEMA = {
  type: 'object',
  required: ['pass', 'backendIssues', 'frontendIssues', 'notes'],
  properties: {
    pass: { type: 'boolean' },
    backendIssues: { type: 'array', items: { type: 'string' } },
    frontendIssues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
const BD_IDS_SCHEMA = {
  type: 'object',
  required: ['epicId', 'issues'],
  properties: {
    epicId: { type: 'string' },
    issues: {
      type: 'object',
      required: ['prd', 'journey', 'design', 'architecture', 'backend', 'frontend', 'qa'],
      properties: {
        prd: { type: 'string' }, journey: { type: 'string' }, design: { type: 'string' },
        architecture: { type: 'string' }, backend: { type: 'string' },
        frontend: { type: 'string' }, qa: { type: 'string' },
      },
    },
  },
}

function bdRun(instruction, label) {
  return agent(
    `You are running beads (bd) CLI commands for the feature pipeline. Use ONLY non-interactive commands; never use 'bd edit'. ${instruction} Return the string "ok" when finished (or the requested JSON).`,
    { label, phase: 'bd-setup' }
  )
}

async function runDesign() {
  if (!prompt) throw new Error('args.prompt is required for the design phase')

  phase('bd-setup')
  const bd = await agent(
    [
      `Create bd issue tracking for a feature pipeline run with slug "${slug}".`,
      `1. Create an epic: bd create --title="Build feature: ${slug}" --type=epic --priority=1 (if --type=epic is rejected, use --type=feature). Capture its id as epicId.`,
      `2. Create 7 child issues (--type=task), capturing each id: titles "[${slug}] PRD", "[${slug}] User journey", "[${slug}] Design", "[${slug}] Architecture", "[${slug}] Backend", "[${slug}] Frontend", "[${slug}] QA".`,
      `3. Add dependencies with 'bd dep add <issue> <depends-on>': journey, design, architecture each depend on PRD; backend and frontend each depend on design AND architecture; qa depends on backend AND frontend.`,
      `4. Claim the PRD issue: bd update <prd-id> --claim.`,
      `Return JSON {"epicId":"...","issues":{"prd":"...","journey":"...","design":"...","architecture":"...","backend":"...","frontend":"...","qa":"..."}} with the REAL ids.`,
    ].join('\n'),
    { label: 'bd:setup', phase: 'bd-setup', schema: BD_IDS_SCHEMA }
  )

  phase('Discovery')
  const brief = await agent(
    `TASK: BRIEF.\nFeature prompt:\n${prompt}${answers ? '\n\nHuman answers to earlier open questions:\n' + JSON.stringify(answers, null, 2) : ''}`,
    { label: 'pm:brief', phase: 'Discovery', agentType: 'product-manager' }
  )

  const fb = await parallel([
    () => agent(`TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'ux:feedback', phase: 'Discovery', agentType: 'ux-researcher', schema: FEEDBACK_SCHEMA }),
    () => agent(`TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'designer:feedback', phase: 'Discovery', agentType: 'designer', schema: FEEDBACK_SCHEMA }),
    () => agent(`TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'architect:feedback', phase: 'Discovery', agentType: 'system-architect', schema: FEEDBACK_SCHEMA }),
  ])
  const feedback = JSON.stringify({ ux: fb[0], designer: fb[1], architect: fb[2] }, null, 2)

  phase('PRD')
  const prd = await agent(
    `TASK: PRD. slug=${slug}. Write ${DOCS}/PRD.md, then return the PRD JSON.\nFeature prompt:\n${prompt}\n\nYour brief:\n${brief}\n\nSpecialist feedback:\n${feedback}${answers ? '\n\nHuman answers:\n' + JSON.stringify(answers, null, 2) : ''}`,
    { label: 'pm:prd', phase: 'PRD', agentType: 'product-manager', schema: PRD_SCHEMA }
  )
  await bdRun(`Close the PRD issue: bd close ${bd.issues.prd}. Then claim the next three (separate commands): bd update ${bd.issues.journey} --claim; bd update ${bd.issues.design} --claim; bd update ${bd.issues.architecture} --claim.`, 'bd:prd-done')

  phase('Design artifacts')
  await parallel([
    () => agent(`TASK: JOURNEY. slug=${slug}. Read ${DOCS}/PRD.md, then write ${DOCS}/USER-JOURNEY.md.`, { label: 'ux:journey', phase: 'Design artifacts', agentType: 'ux-researcher' }),
    () => agent(`TASK: DESIGN. slug=${slug}. Read ${DOCS}/PRD.md (and ${DOCS}/USER-JOURNEY.md if it exists), then write ${DOCS}/DESIGN.md.`, { label: 'designer:design', phase: 'Design artifacts', agentType: 'designer' }),
    () => agent(`TASK: ARCHITECTURE. slug=${slug}. Read ${DOCS}/PRD.md, then write ${DOCS}/ARCHITECTURE.md.`, { label: 'architect:arch', phase: 'Design artifacts', agentType: 'system-architect' }),
  ])
  await bdRun(`Close these issues (separate commands): bd close ${bd.issues.journey}; bd close ${bd.issues.design}; bd close ${bd.issues.architecture}.`, 'bd:design-done')

  return {
    slug, phase: 'design', epicId: bd.epicId, bdIssues: bd.issues,
    docPaths: {
      prd: `${DOCS}/PRD.md`, journey: `${DOCS}/USER-JOURNEY.md`,
      design: `${DOCS}/DESIGN.md`, architecture: `${DOCS}/ARCHITECTURE.md`,
    },
    summary: prd.summary, assumptions: prd.assumptions,
    openQuestions: prd.openQuestions, acceptanceCriteria: prd.acceptanceCriteria,
  }
}

async function runBuild() {
  const bdi = passedBdIssues
  const claim = (k) => (bdi ? bdRun(`Claim: bd update ${bdi[k]} --claim.`, `bd:${k}-claim`) : Promise.resolve('skip'))
  const close = (k) => (bdi ? bdRun(`Close: bd close ${bdi[k]}.`, `bd:${k}-close`) : Promise.resolve('skip'))

  phase('Backend')
  await claim('backend')
  const backend = await agent(`TASK: IMPLEMENT BACKEND. slug=${slug}. Read everything in ${DOCS}/. Implement the backend.`, { label: 'backend:impl', phase: 'Backend', agentType: 'backend-engineer' })
  await close('backend')

  phase('Frontend')
  await claim('frontend')
  await agent(`TASK: IMPLEMENT FRONTEND. slug=${slug}. Read everything in ${DOCS}/. Implement the frontend per DESIGN.md and the API contract in ARCHITECTURE.md.\n\nBackend engineer's handoff notes:\n${backend}`, { label: 'frontend:impl', phase: 'Frontend', agentType: 'frontend-engineer' })
  await close('frontend')

  phase('QA')
  await claim('qa')
  const MAX = 3
  let verdict = null
  let iterations = 0
  while (iterations < MAX) {
    iterations++
    verdict = await agent(`TASK: VERIFY (round ${iterations}). slug=${slug}. Read everything in ${DOCS}/. Build, run, and test the project; verify every acceptance criterion in PRD.md and assess design fidelity. Write ${DOCS}/QA-REPORT.md and return the verdict JSON.`, { label: `qa:round-${iterations}`, phase: 'QA', agentType: 'qa-engineer', schema: QA_SCHEMA })
    if (verdict.pass) break
    log(`QA round ${iterations}: FAIL — ${verdict.backendIssues.length} backend, ${verdict.frontendIssues.length} frontend issue(s).`)
    if (verdict.backendIssues.length) {
      await agent(`TASK: FIX BACKEND. slug=${slug}. Address each QA item:\n- ${verdict.backendIssues.join('\n- ')}`, { label: `backend:fix-${iterations}`, phase: 'QA', agentType: 'backend-engineer' })
    }
    if (verdict.frontendIssues.length) {
      await agent(`TASK: FIX FRONTEND. slug=${slug}. Address each QA item:\n- ${verdict.frontendIssues.join('\n- ')}`, { label: `frontend:fix-${iterations}`, phase: 'QA', agentType: 'frontend-engineer' })
    }
  }
  if (verdict && verdict.pass) { await close('qa'); log('QA passed.') }
  else log(`QA did not pass after ${MAX} round(s); leaving the qa issue open for human follow-up.`)

  return { slug, phase: 'build', passed: !!(verdict && verdict.pass), iterations, qaReport: `${DOCS}/QA-REPORT.md`, verdict }
}

if (phase === 'design') return await runDesign()
if (phase === 'build') return await runBuild()
throw new Error(`Unknown phase "${phase}" — use "design" or "build".`)
```

- [ ] **Step 3: Verify the workflow check passes (green)**

Run: `node scripts/validate-pipeline.mjs workflow`
Expected: PASS — including `✓ references agent <name>` for all seven agents.

- [ ] **Step 4: Run the FULL validation suite**

Run: `node scripts/validate-pipeline.mjs`
Expected: PASS — every agent + the workflow, ending with `All checks passed`, exit 0.

- [ ] **Step 5: Close the bd issue and commit**

```bash
bd close <wf-id>               # the "feature-pipeline workflow script" issue
git add .claude/workflows/feature-pipeline.js
git commit -m "feat(pipeline): add feature-pipeline workflow orchestrator"
```

---

## Task 5: First run — link shortener to the design gate

This task exercises the pipeline end-to-end through the design phase and the human gate. It is run by the **main agent** (the orchestrator that can call the `Workflow` tool and talk to the user), not by a subagent.

**Files:**
- Created at runtime by agents: `docs/features/link-shortener/{PRD,USER-JOURNEY,DESIGN,ARCHITECTURE}.md`

- [ ] **Step 1: Claim the run issue**

```bash
bd update <run-id> --claim     # "First pipeline run on link shortener" issue
```

- [ ] **Step 2: Invoke the design phase**

Call the `Workflow` tool:
- `name`: `feature-pipeline`
- `args`: `{ "phase": "design", "slug": "link-shortener", "prompt": "<seed prompt from the spec, Appendix A>" }`

The seed prompt (verbatim from `docs/superpowers/specs/2026-06-19-multi-agent-dev-pipeline-design.md`, Appendix A):

> Build a **public SaaS link shortener**. Multi-tenant with user accounts. Core: create short link → redirect (hot, high-traffic path). First-version features: **custom aliases**, **click analytics** (counts, timestamps, referrer, geo/device), **expiration & full link management** (CRUD, enable/disable, edit destination), and **QR codes** per link. Recommended backend stack: **Node + TypeScript (NestJS)** with a cache layer (Redis/in-memory) in front of the redirect lookup to keep the hot path fast. Frontend (dashboard) stack: to be decided during design.

Expected: the workflow runs to completion and returns `{ slug, epicId, bdIssues, docPaths, summary, assumptions, openQuestions, acceptanceCriteria }`. The four docs exist under `docs/features/link-shortener/`.

- [ ] **Step 3: Verify the artifacts exist**

Run: `ls -1 docs/features/link-shortener/`
Expected: `ARCHITECTURE.md  DESIGN.md  PRD.md  USER-JOURNEY.md`

- [ ] **Step 4: Present the design gate to the user**

Present: a short summary of each doc, plus the `assumptions` and `openQuestions` lists from the return value. Ask the user to approve, answer the open questions, or request changes. **Stop and wait** — do not start the build phase without approval.

- [ ] **Step 5: Commit the design artifacts**

```bash
git add docs/features/link-shortener/
git commit -m "docs(link-shortener): design-phase artifacts (PRD, journey, design, architecture)"
```

- [ ] **Step 6: On approval — hand off to the build phase**

If the user approves, invoke `Workflow` again with `args: { "phase": "build", "slug": "link-shortener", "bdIssues": <bdIssues from Step 2's return> }`. If the user requested changes, re-invoke the design phase with an added `answers` field, then return to Step 4. (The build phase itself is outside this plan's "build the pipeline" goal; this step is the documented handoff.)

> Leave the `<run-id>` issue **open** until the design gate is approved; close it once the design phase is approved and handed off.

---

## Self-Review

**1. Spec coverage** (checked against `2026-06-19-multi-agent-dev-pipeline-design.md`):
- §2 Deliverables → 7 agents (Tasks 2–3), workflow (Task 4), per-run docs (Task 5). ✓
- §3 Agent roster (tools, I/O) → exact frontmatter + bodies in Tasks 2–3; harness enforces tools. ✓
- §4.1 Design flow (bd-setup → brief → parallel feedback → PRD → parallel artifacts) → `runDesign()`. ✓
- §4.2 Human gate → Task 5 Steps 4 & 6 (main-agent orchestrated). ✓
- §4.3 Build flow (backend → frontend → QA loop, cap 3, sequential) → `runBuild()`. ✓
- §5 Invocation contract + schemas → Task 4 inline schemas + return shapes. ✓
- §6 bd integration (epic + 7 children, deps, serialized transitions) → `bd:*` agent steps + Task 1 build-tracking. ✓
- §8 honest QA reporting (no false pass) → `passed: !!verdict.pass`, qa issue left open on failure. ✓
- §9 Acceptance criteria → covered by Tasks 1–5 + the full-suite run (Task 4 Step 4). ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" left in plan steps. The only "to be decided" is inside the seed *prompt* (frontend stack), which is intentional input for the pipeline. Agent file contents are complete and literal. ✓

**3. Type consistency:** Schema field names (`summary`, `assumptions`, `openQuestions`, `acceptanceCriteria`; `pass`, `backendIssues`, `frontendIssues`, `notes`; `epicId`, `issues.{prd,journey,design,architecture,backend,frontend,qa}`) are identical between the workflow's schemas, the agents' stated return values, and the harness's agent list. Agent `name:` values match filenames and the workflow's `agentType` strings. ✓
