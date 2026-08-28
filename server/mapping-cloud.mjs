import { createHash } from 'node:crypto'
import { boundedText, isSafeDataImage } from './security.mjs'
import { qwenVisionConfigForPurpose, qwenVisionSystemForPurpose } from './qwen-provider.mjs'

const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_CHARS = 14 * 1024 * 1024
const MAX_PAGES = 10
const QWEN_PAGES_PER_BATCH = 2
const MAX_CLAIMS_PER_PAGE = 3
const MAX_CLAIMS = MAX_PAGES * MAX_CLAIMS_PER_PAGE

export class MappingCloudError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'MappingCloudError'
    this.status = status
  }
}

function readPdfDataUrl(value) {
  if (typeof value !== 'string') throw new MappingCloudError('mapping_pdf_missing')
  const match = value.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\r\n]+)$/i)
  if (!match) throw new MappingCloudError('mapping_pdf_invalid_type')
  const bytes = Buffer.from(match[1].replace(/\s/g, ''), 'base64')
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new MappingCloudError('mapping_pdf_size_invalid')
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new MappingCloudError('mapping_pdf_invalid_header')
  return bytes
}

function cleanMeta(value) {
  const meta = value && typeof value === 'object' ? value : {}
  return {
    title: boundedText(meta.title, 180).trim(),
    author: boundedText(meta.author, 120).trim(),
    era: boundedText(meta.era, 80).trim(),
    city: boundedText(meta.city, 80).trim(),
  }
}

export function validateMappingCloudInput(input) {
  if (!input || typeof input !== 'object') throw new MappingCloudError('mapping_request_invalid')
  const source = input.source && typeof input.source === 'object' ? input.source : {}
  const name = boundedText(source.name, 240).trim()
  if (!name.toLowerCase().endsWith('.pdf')) throw new MappingCloudError('mapping_pdf_name_invalid')
  const bytes = readPdfDataUrl(source.pdf)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (!/^[a-f0-9]{64}$/i.test(String(source.sha256 || '')) || sha256 !== String(source.sha256).toLowerCase()) {
    throw new MappingCloudError('mapping_pdf_sha256_mismatch')
  }
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > MAX_PAGES) {
    throw new MappingCloudError('mapping_pages_invalid')
  }
  let imageChars = 0
  const pages = input.pages.map((page, index) => {
    if (!page || typeof page !== 'object') throw new MappingCloudError('mapping_page_invalid')
    const image = typeof page.image === 'string' ? page.image : ''
    imageChars += image.length
    if (!isSafeDataImage(image, 3 * 1024 * 1024)) throw new MappingCloudError(`mapping_page_${index + 1}_image_invalid`)
    const text = boundedText(page.text, 5200).trim()
    if (!text) throw new MappingCloudError(`mapping_page_${index + 1}_ocr_missing`)
    return { page: index + 1, image, text }
  })
  if (imageChars > MAX_IMAGE_CHARS) throw new MappingCloudError('mapping_page_images_too_large')
  return { source: { name, bytes: bytes.length, sha256 }, meta: cleanMeta(input.meta), pages }
}

export function buildMappingCloudMessages(job) {
  const system = qwenVisionSystemForPurpose('mapping')
  const instruction = [
    `资料：${job.meta.title || job.source.name}；作者：${job.meta.author || '未知'}；时代：${job.meta.era || '未知'}；城市范围：${job.meta.city || '不限'}。`,
    `服务端已校验原 PDF：${job.source.name}，${job.source.bytes} 字节，SHA-256 ${job.source.sha256}。以下图像是该 PDF 的 10 页以内逐页渲染，PP-OCR 原文紧随对应页。`,
    `请独立复核图像与 OCR，每页只提炼最多 ${MAX_CLAIMS_PER_PAGE} 个最有代表性、适合落到地图的地点及其在原文中的意义。地点名必须逐字出现在对应 OCR 原文；context 必须是原文片段；description 不超过 45 字，不得补写外部历史知识，不要输出坐标。`,
    '只输出纯 JSON：{"claims":[{"nameAsWritten":"","page":1,"context":"","description":"","relation":"scene|mentioned|route|subject"}]}',
  ].join('\n')
  const content = [{ type: 'text', text: instruction }]
  for (const page of job.pages) {
    content.push({ type: 'text', text: `【小 PDF 第 ${page.page} 页】` })
    content.push({ type: 'image_url', image_url: { url: page.image } })
    content.push({ type: 'text', text: `【第 ${page.page} 页 PP-OCR 原文】\n${page.text}` })
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

function readChoiceText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n')
  return ''
}

function parseClaims(text, batchNumber) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  try {
    const value = JSON.parse(start >= 0 && end > start ? source.slice(start, end + 1) : source)
    if (!Array.isArray(value?.claims)) throw new Error('claims_missing')
    return value.claims
  } catch {
    throw new MappingCloudError(`mapping_cloud_batch_${batchNumber}_invalid_json`, 502)
  }
}

export async function runMappingCloud(input, { qwen, fetcher = fetch } = {}) {
  if (!qwen?.key || !qwen?.url) throw new MappingCloudError('no_qwen_key', 503)
  const job = validateMappingCloudInput(input)
  const vision = qwenVisionConfigForPurpose(qwen, 'mapping')
  const batches = []
  for (let index = 0; index < job.pages.length; index += QWEN_PAGES_PER_BATCH) batches.push(job.pages.slice(index, index + QWEN_PAGES_PER_BATCH))
  const batchClaims = await Promise.all(batches.map(async (pages, index) => {
    const upstream = await fetcher(qwen.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${qwen.key}` },
      body: JSON.stringify({ model: vision.model, temperature: 0, max_tokens: vision.maxTokens, messages: buildMappingCloudMessages({ ...job, pages }) }),
      signal: AbortSignal.timeout(vision.timeoutMs),
    })
    const data = await upstream.json()
    if (!upstream.ok) throw new MappingCloudError(data?.error?.message || `qwen_batch_${index + 1}_${upstream.status}`, upstream.status)
    const text = readChoiceText(data).trim()
    if (!text) throw new MappingCloudError(`mapping_cloud_batch_${index + 1}_empty_text`, 502)
    return parseClaims(text, index + 1)
  }))
  const unique = new Map()
  const pageCounts = new Map()
  for (const claim of batchClaims.flat()) {
    const page = Number(claim?.page)
    const name = claim?.nameAsWritten || claim?.name || ''
    const key = `${name}:${page || ''}`
    const count = pageCounts.get(page) || 0
    if (name && Number.isInteger(page) && page >= 1 && page <= job.pages.length && count < MAX_CLAIMS_PER_PAGE && !unique.has(key)) {
      unique.set(key, claim)
      pageCounts.set(page, count + 1)
    }
    if (unique.size >= MAX_CLAIMS) break
  }
  return {
    text: JSON.stringify({ claims: [...unique.values()] }),
    model: vision.model,
    provider: qwen.provider,
    modelOwner: qwen.owner,
    source: { name: job.source.name, bytes: job.source.bytes, sha256: job.source.sha256, verified: true },
    pages: job.pages.length,
    batches: batches.length,
  }
}
