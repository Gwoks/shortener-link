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

// Be robust to how the runtime delivers args: object, JSON string, or undefined.
const ARGS = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const prompt = ARGS.prompt
const phase = ARGS.phase || 'design'
const slug = ARGS.slug
const answers = ARGS.answers || null
const passedBdIssues = ARGS.bdIssues || null

if (!slug) throw new Error('args.slug is required (e.g. "link-shortener"); received args of type ' + (typeof args))
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

// This harness does not register .claude/agents/*.md as spawnable agentTypes,
// so each specialist runs on the default agent and adopts its role by reading
// its own .md file (the single source of truth for the role's system prompt).
function roleAgent(role, task, opts) {
  opts = opts || {}
  const fullPrompt =
    `You are the "${role}" specialist in a multi-agent feature pipeline. ` +
    `FIRST, read the file .claude/agents/${role}.md and adopt it as your COMPLETE system prompt — ` +
    `your role, operating rules, task format, and return-value contract all come from that file. ` +
    `THEN carry out the task below, honoring that contract exactly.\n\n${task}`
  const o = { label: opts.label, phase: opts.phase }
  if (opts.schema) o.schema = opts.schema
  return agent(fullPrompt, o)
}

function bdRun(instruction, label) {
  return agent(
    `You are running beads (bd) CLI commands for the feature pipeline. Use ONLY non-interactive commands; never use 'bd edit'. ${instruction} Return the string "ok" when finished (or the requested JSON).`,
    { label, phase: 'bd-setup' }
  )
}

async function runDesign() {
  if (!prompt) throw new Error('args.prompt is required for the design phase')

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

  const brief = await roleAgent(
    'product-manager',
    `TASK: BRIEF.\nFeature prompt:\n${prompt}${answers ? '\n\nHuman answers to earlier open questions:\n' + JSON.stringify(answers, null, 2) : ''}`,
    { label: 'pm:brief', phase: 'Discovery' }
  )

  const fb = await parallel([
    () => roleAgent('ux-researcher', `TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'ux:feedback', phase: 'Discovery', schema: FEEDBACK_SCHEMA }),
    () => roleAgent('designer', `TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'designer:feedback', phase: 'Discovery', schema: FEEDBACK_SCHEMA }),
    () => roleAgent('system-architect', `TASK: FEEDBACK.\nPM brief:\n${brief}`, { label: 'architect:feedback', phase: 'Discovery', schema: FEEDBACK_SCHEMA }),
  ])
  const feedback = JSON.stringify({ ux: fb[0], designer: fb[1], architect: fb[2] }, null, 2)

  const prd = await roleAgent(
    'product-manager',
    `TASK: PRD. slug=${slug}. Write ${DOCS}/PRD.md, then return the PRD JSON.\nFeature prompt:\n${prompt}\n\nYour brief:\n${brief}\n\nSpecialist feedback:\n${feedback}${answers ? '\n\nHuman answers:\n' + JSON.stringify(answers, null, 2) : ''}`,
    { label: 'pm:prd', phase: 'PRD', schema: PRD_SCHEMA }
  )
  await bdRun(`Close the PRD issue: bd close ${bd.issues.prd}. Then claim the next three (separate commands): bd update ${bd.issues.journey} --claim; bd update ${bd.issues.design} --claim; bd update ${bd.issues.architecture} --claim.`, 'bd:prd-done')

  await parallel([
    () => roleAgent('ux-researcher', `TASK: JOURNEY. slug=${slug}. Read ${DOCS}/PRD.md, then write ${DOCS}/USER-JOURNEY.md.`, { label: 'ux:journey', phase: 'Design artifacts' }),
    () => roleAgent('designer', `TASK: DESIGN. slug=${slug}. Read ${DOCS}/PRD.md (and ${DOCS}/USER-JOURNEY.md if it exists), then write ${DOCS}/DESIGN.md.`, { label: 'designer:design', phase: 'Design artifacts' }),
    () => roleAgent('system-architect', `TASK: ARCHITECTURE. slug=${slug}. Read ${DOCS}/PRD.md, then write ${DOCS}/ARCHITECTURE.md.`, { label: 'architect:arch', phase: 'Design artifacts' }),
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

  await claim('backend')
  const backend = await roleAgent('backend-engineer', `TASK: IMPLEMENT BACKEND. slug=${slug}. Read everything in ${DOCS}/. Implement the backend.`, { label: 'backend:impl', phase: 'Backend' })
  await close('backend')

  await claim('frontend')
  await roleAgent('frontend-engineer', `TASK: IMPLEMENT FRONTEND. slug=${slug}. Read everything in ${DOCS}/. Implement the frontend per DESIGN.md and the API contract in ARCHITECTURE.md.\n\nBackend engineer's handoff notes:\n${backend}`, { label: 'frontend:impl', phase: 'Frontend' })
  await close('frontend')

  await claim('qa')
  const MAX = 3
  let verdict = null
  let iterations = 0
  while (iterations < MAX) {
    iterations++
    verdict = await roleAgent('qa-engineer', `TASK: VERIFY (round ${iterations}). slug=${slug}. Read everything in ${DOCS}/. Build, run, and test the project; verify every acceptance criterion in PRD.md and assess design fidelity. Write ${DOCS}/QA-REPORT.md and return the verdict JSON.`, { label: `qa:round-${iterations}`, phase: 'QA', schema: QA_SCHEMA })
    if (verdict.pass) break
    log(`QA round ${iterations}: FAIL — ${verdict.backendIssues.length} backend, ${verdict.frontendIssues.length} frontend issue(s).`)
    if (verdict.backendIssues.length) {
      await roleAgent('backend-engineer', `TASK: FIX BACKEND. slug=${slug}. Address each QA item:\n- ${verdict.backendIssues.join('\n- ')}`, { label: `backend:fix-${iterations}`, phase: 'QA' })
    }
    if (verdict.frontendIssues.length) {
      await roleAgent('frontend-engineer', `TASK: FIX FRONTEND. slug=${slug}. Address each QA item:\n- ${verdict.frontendIssues.join('\n- ')}`, { label: `frontend:fix-${iterations}`, phase: 'QA' })
    }
  }
  if (verdict && verdict.pass) { await close('qa'); log('QA passed.') }
  else log(`QA did not pass after ${MAX} round(s); leaving the qa issue open for human follow-up.`)

  return { slug, phase: 'build', passed: !!(verdict && verdict.pass), iterations, qaReport: `${DOCS}/QA-REPORT.md`, verdict }
}

if (phase === 'design') return await runDesign()
if (phase === 'build') return await runBuild()
throw new Error(`Unknown phase "${phase}" — use "design" or "build".`)
