#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REQUIRED_APIS = [
  'aiplatform.googleapis.com',
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'firestore.googleapis.com',
  'run.googleapis.com',
]

function result(name, status, detail, blocking = status === 'fail') {
  return { name, status, detail, blocking }
}

export function staticCloudPreflight(env = process.env, options = {}) {
  const checks = []
  const project = String(options.project || env.GOOGLE_CLOUD_PROJECT || '').trim()
  const region = String(env.GOOGLE_CLOUD_REGION || 'asia-east1').trim()
  const firestoreLocation = String(env.FROST_FIRESTORE_LOCATION || region).trim()
  const nodeMajor = Number(String(options.nodeVersion || process.versions.node).split('.')[0])
  checks.push(result('Node.js 22+', nodeMajor >= 22 ? 'pass' : 'fail', `detected ${options.nodeVersion || process.versions.node}`))
  checks.push(result('Google Cloud project id', /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ? 'pass' : 'fail', project || 'missing'))
  checks.push(result('Cloud Run region', /^[a-z]+-[a-z]+\d$/.test(region) ? 'pass' : 'fail', region))
  checks.push(result('Firestore location chosen', Boolean(firestoreLocation) ? 'pass' : 'fail', firestoreLocation || 'missing'))
  checks.push(result('AMap Web key', Boolean(String(env.VITE_AMAP_KEY || '').trim()) ? 'pass' : 'fail', env.VITE_AMAP_KEY ? 'configured (redacted)' : 'missing'))
  const amapProtection = String(env.VITE_AMAP_SERVICE_HOST || '').trim()
    ? 'service host configured'
    : String(env.VITE_AMAP_SECURITY_JSCODE || '').trim() ? 'security code configured' : ''
  checks.push(result('AMap protection', amapProtection ? 'pass' : 'fail', amapProtection || 'set VITE_AMAP_SERVICE_HOST or VITE_AMAP_SECURITY_JSCODE'))
  for (const relative of ['Dockerfile', 'deploy/all-things-agentic/cloudbuild.yaml', 'deploy/all-things-agentic/deploy.sh']) {
    checks.push(result(relative, existsSync(path.join(root, relative)) ? 'pass' : 'fail', existsSync(path.join(root, relative)) ? 'present' : 'missing'))
  }
  return { project, region, firestoreLocation, checks }
}

function run(bin, args) {
  const completed = spawnSync(bin, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { ok: completed.status === 0, stdout: String(completed.stdout || '').trim(), stderr: String(completed.stderr || '').trim() }
}

function maskedAccount(value) {
  const [name, domain] = String(value || '').split('@')
  return domain ? `${name.slice(0, 1)}***@${domain}` : 'configured (redacted)'
}

export function summarizeCloudPreflight(checks) {
  const blocking = checks.filter((check) => check.blocking && check.status === 'fail')
  return { passed: blocking.length === 0, blocking: blocking.map((check) => check.name), checks }
}

async function main() {
  const args = process.argv.slice(2)
  const projectIndex = args.indexOf('--project')
  const projectArg = projectIndex >= 0 ? args[projectIndex + 1] : ''
  const offline = args.includes('--offline')
  const allowDirty = args.includes('--allow-dirty')
  const base = staticCloudPreflight(process.env, { project: projectArg })
  const checks = [...base.checks]

  const gitStatus = run('git', ['status', '--porcelain'])
  checks.push(result('Clean Git worktree', gitStatus.ok && (!gitStatus.stdout || allowDirty) ? 'pass' : 'fail', gitStatus.stdout ? (allowDirty ? 'dirty explicitly allowed' : 'uncommitted files present') : 'clean'))
  const remotes = run('git', ['remote', '-v'])
  const official = /github\.com[/:]narratorzhang0307\/pocketbuddy(?:\.git)?/i.test(remotes.stdout)
  checks.push(result('Official GitHub remote', remotes.ok && official ? 'pass' : 'fail', official ? 'narratorzhang0307/pocketbuddy' : 'official remote missing'))
  const branch = run('git', ['branch', '--show-current'])
  checks.push(result('Deployment branch', branch.stdout === 'main' ? 'pass' : 'warn', branch.stdout || 'detached', false))

  if (!offline && !checks.some((check) => check.blocking && check.status === 'fail')) {
    const gcloud = String(process.env.GCLOUD_BIN || 'gcloud')
    const version = run(gcloud, ['version'])
    checks.push(result('gcloud CLI', version.ok ? 'pass' : 'fail', version.ok ? (version.stdout.split('\n')[0] || 'installed') : 'not available'))
    if (version.ok) {
      const account = run(gcloud, ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)', '--limit=1'])
      checks.push(result('Active gcloud account', account.ok && Boolean(account.stdout) ? 'pass' : 'fail', account.stdout ? maskedAccount(account.stdout.split('\n')[0]) : 'no active account'))
      const project = run(gcloud, ['projects', 'describe', base.project, '--format=value(lifecycleState)'])
      checks.push(result('Project access', project.ok && project.stdout === 'ACTIVE' ? 'pass' : 'fail', project.ok ? project.stdout : 'not accessible'))
      const billing = run(gcloud, ['billing', 'projects', 'describe', base.project, '--format=json'])
      let billingEnabled = false
      try { billingEnabled = billing.ok && JSON.parse(billing.stdout).billingEnabled === true } catch { billingEnabled = false }
      checks.push(result('Billing enabled', billingEnabled ? 'pass' : 'fail', billingEnabled ? 'enabled (account redacted)' : 'disabled or not visible'))

      const enabledApis = run(gcloud, ['services', 'list', '--enabled', '--project', base.project, '--format=value(config.name)'])
      const enabled = new Set(enabledApis.stdout.split('\n').filter(Boolean))
      const missingApis = REQUIRED_APIS.filter((api) => !enabled.has(api))
      checks.push(result('Required Google APIs', enabledApis.ok && missingApis.length === 0 ? 'pass' : 'warn', missingApis.length ? `deploy.sh will enable: ${missingApis.join(', ')}` : 'enabled', false))

      const firestore = run(gcloud, ['firestore', 'databases', 'describe', '--database=(default)', '--project', base.project, '--format=json'])
      if (!firestore.ok) {
        checks.push(result('Firestore permanent location', 'warn', `database absent; deploy.sh will create it in ${base.firestoreLocation}`, false))
      } else {
        let actual = ''
        try { actual = String(JSON.parse(firestore.stdout).locationId || '') } catch { actual = '' }
        checks.push(result('Firestore permanent location', actual === base.firestoreLocation ? 'pass' : 'fail', actual ? `existing ${actual}; requested ${base.firestoreLocation}` : 'could not read location'))
      }
    }
  } else if (offline) {
    checks.push(result('Live Google Cloud checks', 'warn', 'skipped by --offline', false))
  }

  const summary = summarizeCloudPreflight(checks)
  console.log(JSON.stringify({ protocol: 'frost-gcp-preflight/v1', ...summary }, null, 2))
  if (!summary.passed) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
