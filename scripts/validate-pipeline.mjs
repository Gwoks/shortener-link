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
