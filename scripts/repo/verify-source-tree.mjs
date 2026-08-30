#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_TRACKED_FILE_BYTES = 25 * 1024 * 1024

function git(args) {
  const run = spawnSync('git', args, { cwd: root, encoding: null })
  if (run.status !== 0) throw new Error(Buffer.from(run.stderr || '').toString('utf8').trim() || `git ${args.join(' ')} failed`)
  return Buffer.from(run.stdout || '')
}

const tracked = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean)
const forbiddenTracked = tracked.filter((file) => (
  /^(?:dist|dist-ios|node_modules|\.ios-build|coverage|\.vite|outputs|tmp|deliverables|releases)\//.test(file)
  || /\/(?:node_modules|DerivedData|\.ios-build|coverage|\.vite)\//.test(file)
  || /^ios\/App\/App\/public\//.test(file)
  || /(?:^|\/)\.DS_Store$/.test(file)
  || /\.(?:app|ipa|xcarchive|zip)$/i.test(file)
  || (/^(?:.*\/)?\.env(?:\..+)?$/.test(file) && path.basename(file) !== '.env.example')
))

const required = [
  'package-lock.json',
  'server.mjs',
  'server/google-agent-provider.mjs',
  'server/google-cloud-service-contracts.mjs',
  'server/agent-prompt-harness.mjs',
  'server/agent-evidence-store.mjs',
  'frost-agent/taskmaster/index.ts',
  'src/app/components/MyMapTab.tsx',
  'src/app/components/SkillCanvasPage.tsx',
  'src/app/components/SkillCanvasEditor.tsx',
  'native/frost-badge/ios/BirdCatalog.json',
  'scripts/hardware/build-pet-bird-assets.mjs',
]

const missing = required.filter((file) => !existsSync(path.join(root, file)))
const retiredCanvas = [
  'src/app/components/SkillCanvasTab.tsx',
  'src/app/components/SkillDeckBuilder.tsx',
  'src/app/components/SkillDeckBuilder.css',
].filter((file) => existsSync(path.join(root, file)))

const oversized = []
let trackedBytes = 0
for (const file of tracked) {
  const absolute = path.join(root, file)
  if (!existsSync(absolute)) continue
  const info = statSync(absolute)
  if (!info.isFile()) continue
  trackedBytes += info.size
  if (info.size > MAX_TRACKED_FILE_BYTES) oversized.push({ file, bytes: info.size })
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const problems = []
if (forbiddenTracked.length) problems.push({ name: 'generated_or_private_files_tracked', files: forbiddenTracked })
if (missing.length) problems.push({ name: 'current_source_entry_missing', files: missing })
if (retiredCanvas.length) problems.push({ name: 'retired_skill_canvas_restored', files: retiredCanvas })
if (oversized.length) problems.push({ name: 'tracked_file_over_25_mib', files: oversized })
if (tracked.includes('pnpm-lock.yaml') || tracked.includes('pnpm-workspace.yaml')) problems.push({ name: 'conflicting_root_package_manager', files: tracked.filter((file) => file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml') })
if (pkg.repository?.url !== 'https://github.com/narratorzhang0307/pocketbuddy.git') problems.push({ name: 'noncanonical_repository_metadata' })

const output = {
  protocol: 'pocket-buddy-source-tree-check/v1',
  passed: problems.length === 0,
  trackedFiles: tracked.length,
  trackedBytes,
  maxTrackedFileBytes: MAX_TRACKED_FILE_BYTES,
  packageManager: 'npm',
  problems,
}

console.log(JSON.stringify(output, null, 2))
if (!output.passed) process.exitCode = 1
