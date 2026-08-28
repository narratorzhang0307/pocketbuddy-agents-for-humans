#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const INSTALL_ROOT = path.join(ROOT, 'var', 'health-skills')
const BIN_DIR = path.join(INSTALL_ROOT, 'bin')
const METADATA_PATH = path.join(INSTALL_ROOT, 'install.json')
const USER_AGENT = 'PocketBuddy-health-skill-installer/1.0'

const CONNECTORS = [
  {
    id: 'healthsync',
    repo: 'BRO3886/healthsync',
    tag: 'v0.5.3',
    binary: 'healthsync',
    versionArgs: ['version'],
    assetName(platform, arch) {
      const os = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null
      const cpu = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'amd64' : null
      return os && cpu ? `healthsync-${os}-${cpu}.tar.gz` : null
    },
    archive: 'tar.gz',
  },
  {
    id: 'garmin-connect',
    repo: 'eddmann/garmin-connect-cli',
    tag: 'v1.0.1',
    binary: 'garmin-connect',
    versionArgs: ['--version'],
    assetName(platform, arch) {
      if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) return `garmin-connect-macos-${arch}`
      if (platform === 'linux' && arch === 'x64') return 'garmin-connect-linux-x64'
      return null
    },
    archive: null,
  },
]

function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      else reject(new Error(`${path.basename(binary)} exited with ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

async function pinnedRelease(repo, tag, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`Unable to resolve ${repo} ${tag}: HTTP ${response.status}`)
  return response.json()
}

function expectedSha256(asset) {
  const digest = String(asset.digest || '')
  return digest.startsWith('sha256:') ? digest.slice(7).toLowerCase() : null
}

async function downloadVerified(url, destination, expected, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)
  const hash = createHash('sha256')
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body), hasher, createWriteStream(destination, { flags: 'wx' }))
  const actual = hash.digest('hex')
  if (expected && actual !== expected) throw new Error(`SHA-256 mismatch: expected ${expected}, received ${actual}`)
  return actual
}

async function installConnector(connector, { force = false, fetchImpl = fetch } = {}) {
  const assetName = connector.assetName(process.platform, process.arch)
  if (!assetName) throw new Error(`${connector.id} has no supported release for ${process.platform}/${process.arch}`)
  const release = await pinnedRelease(connector.repo, connector.tag, fetchImpl)
  if (release.tag_name !== connector.tag) throw new Error(`${connector.id} resolved unexpected tag ${release.tag_name}`)
  const asset = release.assets?.find((candidate) => candidate.name === assetName)
  if (!asset) throw new Error(`${connector.id} ${release.tag_name} does not publish ${assetName}`)

  const destination = path.join(BIN_DIR, connector.binary)
  const previous = await readMetadata()
  const previousEntry = previous.connectors?.find((entry) => entry.id === connector.id)
  if (!force && previousEntry?.tag === release.tag_name && existsSync(destination)) {
    return { ...previousEntry, skipped: true }
  }

  const staging = path.join(INSTALL_ROOT, `.staging-${connector.id}-${randomUUID()}`)
  const downloadPath = path.join(staging, assetName)
  const stagedBinary = path.join(staging, connector.binary)
  await mkdir(staging, { recursive: true })
  try {
    const sha256 = await downloadVerified(asset.browser_download_url, downloadPath, expectedSha256(asset), fetchImpl)
    if (connector.archive === 'tar.gz') {
      await run('tar', ['-xzf', downloadPath, '-C', staging])
    } else {
      await copyFile(downloadPath, stagedBinary)
    }
    if (!existsSync(stagedBinary)) throw new Error(`${assetName} did not contain ${connector.binary}`)
    await chmod(stagedBinary, 0o755)
    const temporaryDestination = `${destination}.${randomUUID()}.tmp`
    await copyFile(stagedBinary, temporaryDestination)
    await chmod(temporaryDestination, 0o755)
    await rename(temporaryDestination, destination)
    return {
      id: connector.id,
      repository: `https://github.com/${connector.repo}`,
      tag: release.tag_name,
      asset: assetName,
      source: asset.browser_download_url,
      bytes: asset.size,
      sha256,
      binary: path.relative(ROOT, destination),
      installedAt: new Date().toISOString(),
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function readMetadata() {
  try { return JSON.parse(await readFile(METADATA_PATH, 'utf8')) }
  catch { return { schemaVersion: 1, connectors: [] } }
}

async function writeMetadata(connectors) {
  const value = { schemaVersion: 1, installRoot: path.relative(ROOT, INSTALL_ROOT), connectors }
  await writeFile(METADATA_PATH, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function verifyConnectors() {
  const results = []
  for (const connector of CONNECTORS) {
    const binary = path.join(BIN_DIR, connector.binary)
    if (!existsSync(binary)) throw new Error(`${connector.binary} is not installed; run npm run health:install-connectors`)
    const result = await run(binary, connector.versionArgs, { capture: true })
    results.push({ id: connector.id, binary: path.relative(ROOT, binary), version: result.stdout || result.stderr })
  }
  return results
}

export async function main(argv = process.argv.slice(2)) {
  await mkdir(BIN_DIR, { recursive: true })
  if (argv.includes('--verify-only')) {
    const results = await verifyConnectors()
    console.log(JSON.stringify({ verified: true, connectors: results }, null, 2))
    return
  }
  const force = argv.includes('--force')
  const installed = []
  for (const connector of CONNECTORS) installed.push(await installConnector(connector, { force }))
  await writeMetadata(installed.map(({ skipped: _skipped, ...entry }) => entry))
  const verified = await verifyConnectors()
  console.log(JSON.stringify({ installed, verified }, null, 2))
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
