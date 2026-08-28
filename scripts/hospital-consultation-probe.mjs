// Explicit, at-most-once two-turn connectivity probe. No microphone or health data.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHospitalConsultationHandler } from '../server/hospital-consultation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ configured: !!(env.DASHSCOPE_API_KEY || env.QWEN_API_KEY), live: false }));
  process.exit(0);
}
const output = path.join(os.homedir(), '.local/share/pocketbuddy-esp/hospital-qwen-probe-20260827');
mkdirSync(output, { recursive: true, mode: 0o700 });
// A timeout can still be charged. Re-running this command must not silently repeat calls.
writeFileSync(path.join(output, 'attempt.json'), JSON.stringify({ startedAt: new Date().toISOString(), maxCalls: 2 }), { flag: 'wx', mode: 0o600 });
env.HOSPITAL_CHAT_ACCESS_TOKEN = randomBytes(32).toString('hex');
const handler = createHospitalConsultationHandler({ env });
const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.statusCode = 404; res.end(); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/hospital-agent/consultation`;
const sessionId = randomUUID();
const results = [];
try {
  for (const body of [
    { action: 'start', sessionId, inputId: randomUUID() },
    { action: 'message', sessionId, inputId: randomUUID(), text: '这是连接测试，我没有身体不适。请确认你还记得自己是哪个助手，不提供医疗建议。' },
  ]) {
    const began = Date.now();
    const response = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HOSPITAL_CHAT_ACCESS_TOKEN}` }, body: JSON.stringify(body) });
    const data = await response.json();
    const result = { action: body.action, status: response.status, elapsedMs: Date.now() - began, active: data.active === true,
      replyCharacters: typeof data.text === 'string' ? [...data.text].length : 0, adapter: data.adapter, model: data.model, error: data.error };
    results.push(result); console.log(JSON.stringify(result));
    if (!response.ok) break;
  }
} finally {
  await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.HOSPITAL_CHAT_ACCESS_TOKEN}` }, body: JSON.stringify({ action: 'end', sessionId, inputId: randomUUID() }) }).catch(() => {});
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ finishedAt: new Date().toISOString(), results, scope: 'local API to configured Qwen; not a phone/BLE/lockscreen test' }, null, 2), { mode: 0o600 });
}
if (results.length !== 2 || results.some(r => r.status !== 200 || !r.active)) process.exitCode = 1;
