#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const finalMode = process.argv.includes('--final');
const failures = [];
const checks = [];

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function checkFile(relativePath) {
  try {
    const info = await stat(path.join(root, relativePath));
    const passed = info.isFile() && info.size > 0;
    checks.push({ name: relativePath, passed });
    if (!passed) failures.push(`${relativePath} is not a non-empty file`);
  } catch {
    checks.push({ name: relativePath, passed: false });
    failures.push(`${relativePath} is missing`);
  }
}

function check(name, condition, message) {
  checks.push({ name, passed: Boolean(condition) });
  if (!condition) failures.push(message);
}

const requiredFiles = [
  'README.md',
  'Dockerfile',
  '.dockerignore',
  '.gcloudignore',
  'server/google-agent-provider.mjs',
  'server/agent-prompt-harness.mjs',
  'server/agent-evidence-store.mjs',
  'server/cloud-data-contracts.mjs',
  'scripts/agentic/preflight-cloud.mjs',
  'deploy/all-things-agentic/deploy.sh',
  'deploy/all-things-agentic/cloudbuild.yaml',
  'deploy/all-things-agentic/runtime/package.json',
  'deploy/all-things-agentic/runtime/package-lock.json',
  'deploy/all-things-agentic/README.md',
  'public/agentic-demo.html',
  'docs/competitions/all-things-agentic-2026/README.md',
  'docs/competitions/all-things-agentic-2026/DEVPOST_SUBMISSION.md',
  'docs/competitions/all-things-agentic-2026/DEMO_SCRIPT.md',
  'docs/competitions/all-things-agentic-2026/PREEXISTING_DISCLOSURE.md',
  'docs/competitions/all-things-agentic-2026/SUBMISSION_CHECKLIST.md',
  'docs/competitions/all-things-agentic-2026/ARCHITECTURE.svg',
  'docs/competitions/all-things-agentic-2026/OFFICIAL_REQUIREMENTS_AUDIT.md',
  'docs/competitions/all-things-agentic-2026/ITERATION_LOG.md',
  'docs/competitions/all-things-agentic-2026/AGENT_READINESS.md',
  'docs/competitions/all-things-agentic-2026/HARDWARE_DEMO_CHECKLIST.md',
  'docs/backend/README.md',
  'docs/backend/CURRENT_API_CONTRACT.md',
  'docs/backend/PROMPT_HARNESS.md',
  'docs/backend/CURRENT_DATA_BOUNDARIES.md',
  'docs/backend/REFERENCE_ARCHITECTURE_REVIEW.md',
  'docs/backend/TAIWAN_GCP_HANDOFF.md',
];

await Promise.all(requiredFiles.map(checkFile));

const rootReadme = await text('README.md');
check('Root README uses Google submission identity', rootReadme.includes('All Things Agentic Hackathon 2026') && rootReadme.includes('narratorzhang0307/pocketbuddy'), 'README.md must identify the Google competition and official repository');

const pkg = JSON.parse(await text('package.json'));
check('Node.js runtime', pkg.engines?.node === '>=22.0.0', 'package.json must require Node.js 22+');
check('Canonical repository metadata', pkg.repository?.url === 'https://github.com/narratorzhang0307/pocketbuddy.git', 'package.json must identify the official pocketbuddy repository');
check('Google Gen AI SDK', pkg.dependencies?.['@google/genai'] === '2.19.0', '@google/genai must be pinned to 2.19.0');
check('Firestore SDK', pkg.dependencies?.['@google-cloud/firestore'] === '9.0.0', '@google-cloud/firestore must be pinned to 9.0.0');
check('Hardware host verification', pkg.scripts?.['hardware:check'] === 'node scripts/hardware/verify-agent-link.mjs', 'package.json must expose the AgentLink host verification');

const builtins = await text('src/app/lib/skill/builtins.ts');
const disabledBuiltins = builtins.slice(builtins.indexOf('DEFAULT_DISABLED_BUILTIN_SKILL_IDS'), builtins.indexOf('export function shouldAutoEquipBuiltin'));
for (const connector of ['frost.healthsync', 'frost.garmin-readonly', 'frost.wger-planner', 'frost.mealie-kitchen', 'frost.health-consultation']) {
  check(`Connector disabled by default: ${connector}`, disabledBuiltins.includes(`'${connector}'`), `${connector} must remain in the default-disabled set`);
}
const subagentRegistry = await text('frost-agent/subagents/registry.ts');
check('Only equipped Skills become subagents', subagentRegistry.includes("filter((skill) => skill.availability === 'equipped')"), 'subagent registry must exclude unconfigured Skills');

const envExample = await text('.env.example');
check('Gemini model default', envExample.includes('GEMINI_MODEL=gemini-3.5-flash'), '.env.example must default to Gemini 3.5 Flash');
check('Vertex AI enabled', envExample.includes('GOOGLE_GENAI_USE_VERTEXAI=true'), '.env.example must enable the Vertex AI transport');
check('Firestore evidence enabled', envExample.includes('FROST_FIRESTORE_ENABLED=true'), '.env.example must describe Firestore evidence');
check('AMap retained', envExample.includes('VITE_MAP_PROVIDER=amap'), 'AMap must remain the configured map layer');
check('Taiwan Cloud Run default', envExample.includes('GOOGLE_CLOUD_REGION=asia-east1'), '.env.example must describe the Taiwan Cloud Run region');
check('Taiwan Firestore default', envExample.includes('FROST_FIRESTORE_LOCATION=asia-east1'), '.env.example must describe the permanent Taiwan Firestore location');

const server = await text('server.mjs');
check('Readiness endpoint', server.includes("'/api/agentic-readiness'"), 'server.mjs must expose /api/agentic-readiness');
check('Gemini provider wired', server.includes('createGoogleAgentProvider'), 'server.mjs must wire the Google agent provider');
check('Evidence store wired', server.includes('createAgentEvidenceStore'), 'server.mjs must wire the Firestore evidence store');
check('Prompt harness wired', server.includes('prepareAgentPromptRequest'), 'server.mjs must apply the server-owned prompt harness');
check('Prompt harness readiness', server.includes('promptHarness:'), 'readiness and responses must report the prompt harness');

const promptHarness = await text('server/agent-prompt-harness.mjs');
check('Prompt harness protocol', promptHarness.includes("frost-agent-prompt-harness/v1"), 'prompt harness protocol must be versioned');
check('Client instruction demoted', promptHarness.includes('untrusted and lower priority'), 'client task instructions must remain lower priority than server policy');
check('Structured output validation', promptHarness.includes("throw new Error('bad_model_output')"), 'structured model output must be validated');
check('Prompt budget provenance', promptHarness.includes('receivedChars') && promptHarness.includes('truncated:'), 'prompt harness must report deterministic, non-content budget provenance');

const deployScript = await text('deploy/all-things-agentic/deploy.sh');
check('GCP preflight before mutation', deployScript.indexOf('preflight-cloud.mjs') < deployScript.indexOf('gcloud services enable'), 'deploy.sh must run preflight before creating resources');
check('Taiwan deployment region', deployScript.includes('GOOGLE_CLOUD_REGION:-asia-east1'), 'deploy.sh must default Cloud Run to asia-east1');
check('Required Firestore evidence', deployScript.includes('FROST_FIRESTORE_REQUIRED=true'), 'production deploy must fail closed when Firestore evidence cannot be stored');

const dataContracts = await text('server/cloud-data-contracts.mjs');
check('Competition data scope explicit', dataContracts.includes("implemented: Object.freeze(['frost_agent_runs'])"), 'competition Firestore scope must be explicit');
check('Evidence allowlist enforced', dataContracts.includes('agent_evidence_field_not_allowed'), 'Firestore evidence must reject undeclared fields');
check('Reserved GCS paths are machine-built', dataContracts.includes('gcsUserMediaObject') && dataContracts.includes('gcsPetJobPrefix'), 'reserved GCS object paths must use validated builders');

const architecture = await text('docs/competitions/all-things-agentic-2026/ARCHITECTURE.svg');
check('Architecture shows prompt harness', architecture.includes('Server Prompt Harness v1'), 'architecture must show the server prompt boundary');

const demoPage = await text('public/agentic-demo.html');
check('Judge page reports stored evidence correctly', demoPage.includes("data.evidence?.status === 'stored'"), 'judge page must use the evidence status contract');

const firestoreStore = await text('server/agent-evidence-store.mjs');
for (const forbidden of ['prompt:', 'response:', 'healthData:', 'location:']) {
  check(`Firestore excludes ${forbidden}`, !firestoreStore.includes(forbidden), `Firestore evidence store must not persist ${forbidden}`);
}

if (finalMode) {
  const submission = await text('docs/competitions/all-things-agentic-2026/DEVPOST_SUBMISSION.md');
  const placeholders = ['<HOSTED_URL>', '<VIDEO_URL>', '[HOSTED URL]', '[VIDEO URL]', 'CLOUD_RUN_URL', 'PUBLIC_YOUTUBE_OR_VIMEO_URL'];
  check('Final links filled', !placeholders.some((value) => submission.includes(value)), 'Final submission still contains hosted URL or video URL placeholders');
}

const passed = failures.length === 0;
console.log(JSON.stringify({ passed, mode: finalMode ? 'final' : 'pre-deploy', checks }, null, 2));
if (!passed) {
  console.error(`\n${failures.length} submission check(s) failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
