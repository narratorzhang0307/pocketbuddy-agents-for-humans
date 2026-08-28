import { readOutdoorWindow } from './outdoor-window.mjs'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import {
  buildGarminReadCommand,
  buildHealthsyncImportCommand,
  buildHealthsyncReadCommand,
  buildOpenFoodFactsRequest,
} from './health-skill-policy.mjs'

const MAX_JSON_BODY = 32 * 1024
const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024
const MAX_HEALTH_EXPORT = 1024 * 1024 * 1024

function sendJson(res, value, status = 200) {
  if (res.headersSent || res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'private, no-store')
  res.end(JSON.stringify(value))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_JSON_BODY) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch { reject(new Error('invalid_json')) }
    })
    req.on('error', reject)
  })
}

function parseCommandOutput(stdout) {
  const text = stdout.trim()
  if (!text) return null
  try { return JSON.parse(text) }
  catch { return { text } }
}

function createCommandRunner(env, spawnImpl = spawn, projectRoot = process.cwd()) {
  const binaryFor = (name) => {
    if (name === 'healthsync') return env.HEALTHSYNC_BIN || name
    if (name === 'garmin-connect') return env.GARMIN_CONNECT_BIN || name
    throw new Error('binary_not_allowed')
  }
  const installedBinaryFor = (name) => {
    const override = binaryFor(name)
    if (override !== name) return override
    const local = path.join(projectRoot, 'var', 'health-skills', 'bin', name)
    return existsSync(local) ? local : name
  }
  return (command, options = {}) => new Promise((resolve, reject) => {
    const [name, ...args] = command
    let settled = false
    let stdout = ''
    let outputBytes = 0
    const child = spawnImpl(installedBinaryFor(name), args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(() => reject(new Error('command_timeout')))
    }, options.timeoutMs || 20_000)
    child.stdout?.on('data', (chunk) => {
      outputBytes += chunk.length
      if (outputBytes > MAX_COMMAND_OUTPUT) {
        child.kill('SIGTERM')
        finish(() => reject(new Error('command_output_too_large')))
        return
      }
      stdout += chunk.toString('utf8')
    })
    child.stderr?.resume()
    child.on('error', (error) => finish(() => reject(error)))
    child.on('close', (code) => finish(() => {
      if (code === 0) resolve({ data: parseCommandOutput(stdout), exitCode: 0 })
      else reject(Object.assign(new Error('command_failed'), { exitCode: code }))
    }))
  })
}

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeOpenFoodFactsProduct(product) {
  if (!product || typeof product !== 'object') return null
  const nutriments = product.nutriments && typeof product.nutriments === 'object' ? product.nutriments : {}
  const nutritionPer100g = {
    energyKcal: numeric(nutriments['energy-kcal_100g']),
    proteinG: numeric(nutriments.proteins_100g),
    fatG: numeric(nutriments.fat_100g),
    carbsG: numeric(nutriments.carbohydrates_100g),
    sugarsG: numeric(nutriments.sugars_100g),
    fiberG: numeric(nutriments.fiber_100g),
    saltG: numeric(nutriments.salt_100g),
  }
  return {
    barcode: String(product.code || ''),
    name: String(product.product_name || ''),
    brands: String(product.brands || ''),
    quantity: String(product.quantity || ''),
    servingSize: String(product.serving_size || ''),
    nutritionGrade: String(product.nutrition_grades || ''),
    nutritionPer100g,
    missing: Object.entries(nutritionPer100g).filter(([, value]) => value === null).map(([key]) => key),
    source: 'Open Food Facts',
  }
}

export function createHealthSkillBridge({ env = process.env, fetchImpl = fetch, spawnImpl = spawn, localBridgeEnabled = false, projectRoot = process.cwd() } = {}) {
  const runCommand = createCommandRunner(env, spawnImpl, projectRoot)
  const foodCache = new Map()
  let statusCache = null
  let importJob = { status: 'idle' }

  const commandStatus = async (name, command) => {
    if (!localBridgeEnabled) return { available: false, reason: 'local_bridge_disabled' }
    try {
      const result = await runCommand(command, { timeoutMs: 5_000 })
      return { available: true, version: result.data?.text || result.data || 'installed' }
    } catch (error) {
      return { available: false, reason: error?.code === 'ENOENT' ? 'not_installed' : 'unavailable' }
    }
  }

  const getStatus = async () => {
    if (statusCache && Date.now() - statusCache.at < 10_000) return statusCache.value
    const [healthsync, garmin] = await Promise.all([
      commandStatus('healthsync', ['healthsync', 'version']),
      commandStatus('garmin-connect', ['garmin-connect', '--version']),
    ])
    const value = { localBridgeEnabled, healthsync, garmin, openFoodFacts: { available: true }, cnFoodLibrary: { available: true } }
    statusCache = { at: Date.now(), value }
    return value
  }

  const lookupFood = async (url) => {
    const key = url.toString()
    const cached = foodCache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    const upstream = await fetchImpl(url, {
      headers: { 'user-agent': env.OPENFOODFACTS_USER_AGENT || 'PocketEarth/1.0 (https://pocketearth.throughtheglass.art)' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!upstream.ok) throw Object.assign(new Error('openfoodfacts_upstream_error'), { status: upstream.status })
    const raw = await upstream.json()
    const products = (Array.isArray(raw?.products) ? raw.products : raw?.product ? [raw.product] : [])
      .map(normalizeOpenFoodFactsProduct)
      .filter(Boolean)
    const value = { products, count: products.length, source: 'Open Food Facts', retrievedAt: new Date().toISOString() }
    foodCache.set(key, { expires: Date.now() + 10 * 60_000, value })
    return value
  }

  const startImport = async (req, res, url) => {
    if (!localBridgeEnabled) return sendJson(res, { error: 'local_bridge_disabled' }, 503)
    if (importJob.status === 'receiving' || importJob.status === 'running') return sendJson(res, { error: 'healthsync_import_busy' }, 409)
    const filename = path.basename(String(url.searchParams.get('filename') || ''))
    const extension = path.extname(filename).toLowerCase()
    if (!['.zip', '.xml'].includes(extension) || filename.length > 128) return sendJson(res, { error: 'invalid_health_export' }, 400)
    const contentLength = Number(req.headers['content-length'] || 0)
    if (contentLength > MAX_HEALTH_EXPORT) return sendJson(res, { error: 'health_export_too_large' }, 413)
    try { await runCommand(['healthsync', 'version'], { timeoutMs: 5_000 }) }
    catch { return sendJson(res, { error: 'healthsync_not_installed' }, 503) }

    const jobId = randomUUID()
    const directory = await mkdtemp(path.join(tmpdir(), 'frost-healthsync-'))
    const filePath = path.join(directory, `export${extension}`)
    let received = 0
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length
        callback(received > MAX_HEALTH_EXPORT ? new Error('health_export_too_large') : null, chunk)
      },
    })
    importJob = { jobId, status: 'receiving', filename, receivedBytes: 0, startedAt: new Date().toISOString() }
    try {
      await pipeline(req, limiter, createWriteStream(filePath, { flags: 'wx' }))
      importJob = { ...importJob, status: 'running', receivedBytes: received }
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      importJob = { ...importJob, status: 'failed', error: error.message === 'health_export_too_large' ? 'health_export_too_large' : 'upload_failed' }
      return sendJson(res, { error: importJob.error }, importJob.error === 'health_export_too_large' ? 413 : 400)
    }

    void runCommand(buildHealthsyncImportCommand(filePath), { timeoutMs: 30 * 60_000 })
      .then((result) => { importJob = { ...importJob, status: 'complete', result: result.data, completedAt: new Date().toISOString() } })
      .catch((error) => { importJob = { ...importJob, status: 'failed', error: error.message || 'parse_failed', completedAt: new Date().toISOString() } })
      .finally(() => rm(directory, { recursive: true, force: true }))
    return sendJson(res, { jobId, status: 'running', receivedBytes: received }, 202)
  }

  return async function handleHealthSkillRequest(req, res, suppliedUrl) {
    const url = suppliedUrl || new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname
    if (!pathname.startsWith('/api/health-skills')) return false
    try {
      if (pathname === '/api/health-skills/status' && req.method === 'GET') {
        sendJson(res, await getStatus())
        return true
      }
      if (pathname === '/api/health-skills/outdoor' && req.method === 'GET') {
        sendJson(res, await readOutdoorWindow(url.searchParams.get('city'), { fetcher: fetchImpl, dayOffset: Number(url.searchParams.get('dayOffset') || 0) }))
        return true
      }
      if (pathname === '/api/health-skills/openfoodfacts' && req.method === 'GET') {
        const request = buildOpenFoodFactsRequest({
          barcode: url.searchParams.get('barcode') || undefined,
          query: url.searchParams.get('query') || undefined,
          pageSize: url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : undefined,
        })
        sendJson(res, await lookupFood(request))
        return true
      }
      if (pathname === '/api/health-skills/healthsync/import' && req.method === 'POST') {
        await startImport(req, res, url)
        return true
      }
      if (pathname === '/api/health-skills/healthsync/import/status' && req.method === 'GET') {
        sendJson(res, importJob)
        return true
      }
      if (pathname === '/api/health-skills/healthsync/query' && req.method === 'POST') {
        if (!localBridgeEnabled) { sendJson(res, { error: 'local_bridge_disabled' }, 503); return true }
        const command = buildHealthsyncReadCommand(await readJson(req))
        const result = await runCommand(command)
        sendJson(res, { provider: 'healthsync', readOnly: true, data: result.data })
        return true
      }
      if (pathname === '/api/health-skills/garmin/query' && req.method === 'POST') {
        if (!localBridgeEnabled) { sendJson(res, { error: 'local_bridge_disabled' }, 503); return true }
        const command = buildGarminReadCommand(await readJson(req))
        const result = await runCommand(command)
        sendJson(res, { provider: 'garmin', readOnly: true, data: result.data })
        return true
      }
      sendJson(res, { error: req.method === 'GET' || req.method === 'POST' ? 'not_found' : 'method_not_allowed' }, req.method === 'GET' || req.method === 'POST' ? 404 : 405)
      return true
    } catch (error) {
      const validation = /^(invalid_|.*_not_allowed|body_too_large)/.test(error?.message || '')
      const upstreamStatus = Number(error?.status)
      sendJson(res, { error: error?.message || 'health_skill_bridge_error' }, validation ? 400 : upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502)
      return true
    }
  }
}
