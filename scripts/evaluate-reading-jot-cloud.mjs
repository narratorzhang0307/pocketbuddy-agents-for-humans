import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = await readFile(join(projectRoot, 'tests/fixtures/reading-jot/real-world/dictionary-spread.jpg'));
const crop = await sharp(page).extract({ left: 930, top: 920, width: 770, height: 190 }).jpeg({ quality: 92 }).toBuffer();
const image = `data:image/jpeg;base64,${crop.toString('base64')}`;
const excerpt = '出版者：世界書局\n印刷者：世界書局\n發行所：世界書局';
const endpoint = process.env.READING_JOT_CLOUD_ENDPOINT || 'https://pocketearth.throughtheglass.art/api/qwen-vision';
const vite = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true } });

try {
  const { runReadingCloudAnalysis } = await vite.ssrLoadModule('/src/app/lib/readingJotAi.ts');
  const result = await runReadingCloudAnalysis(image, { excerpt }, { endpoint });
  process.stdout.write(`${JSON.stringify({
    schema: 'pocket-earth.reading-jot-cloud-eval.v1',
    endpoint,
    input: excerpt,
    result,
    correctedExact: result.correctedExcerpt === excerpt,
    evidenceGuarded: result.tags.join(',') === '版权页,出版信息'
      && !/1930|1940|上海|台北|民国/u.test(`${result.interpretation} ${result.tags.join(' ')} ${result.ambiguities || ''}`),
  }, null, 2)}\n`);
} finally {
  await vite.close();
}
