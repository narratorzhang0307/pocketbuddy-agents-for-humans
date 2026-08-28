import {
  DATA_PACK_PROTOCOL,
  DATA_PACK_RUNTIME_VERSION,
  dataPackAdapterForDomain,
  type DataPackDomain,
} from './types';

const DOMAIN_LABELS: Record<DataPackDomain, string> = { books: '书籍', movies: '电影', music: '音乐' };
const domainLabel = (domain: DataPackDomain) => DOMAIN_LABELS[domain];

export function createEmptyDataPackTemplate(domain: DataPackDomain, generatedAt = new Date().toISOString()) {
  const adapter = dataPackAdapterForDomain(domain);
  return {
    protocol: DATA_PACK_PROTOCOL,
    identity: {
      id: `com.example.my-${domain}`,
      name: `我的${domainLabel(domain)}数据包`,
      version: '1.0.0',
      author: '请填写作者',
      description: `符合 ${DATA_PACK_PROTOCOL} 的${domainLabel(domain)}数据包`,
    },
    schema: {
      name: adapter.schemaName,
      version: adapter.schemaVersion,
      record_count: 0,
    },
    compatibility: {
      skills: [adapter.skillId],
      runtime_min: DATA_PACK_RUNTIME_VERSION,
    },
    privacy: 'private',
    provenance: {
      source: '请填写原始数据来源',
      license: 'private-use',
      generated_at: generatedAt,
    },
    distribution: { mode: 'inline' },
    records: [],
  };
}

export function createDataPackAiInstruction(domain: DataPackDomain): string {
  const adapter = dataPackAdapterForDomain(domain);
  const recordRule = domain === 'books'
    ? '每条记录使用字段：id、title、author、country、type、year、rating、date、synopsis，可选 locations。'
    : domain === 'movies'
      ? '每条记录使用字段：id、title、original、type、director、country、year、rating、publicRating、date、synopsis，可选 locations。'
      : '每条记录代表一座城市电台，使用 id、slug、cityName、cityNameZh、ianaTz、tzOffset、station、cover、lat、lng、description、tracks、podcast。每首 track 使用 id、title、artist、genre、durationSec、playback、introText、introPlayback。YouTube 来源写成 playback={provider:"youtube",url:"",sourceId:"视频 ID",sourceUrl:"原始 HTTPS 页面"}；可直接播放的 OSS/外部音频写成 provider="oss" 或 "external"，并在 url 提供可播放的 HTTPS 音频地址。不要把 YouTube 歌单 URL 当成 Data Pack Manifest。';
  return `请把我提供的数据整理为 Pocket Earth 的 ${DATA_PACK_PROTOCOL} 单文件 Bundle。

目标 Skill：${adapter.skillId}
记录 Schema：${adapter.schemaName}
Schema 版本：${adapter.schemaVersion}

规则：
1. 使用我附带的 JSON 模板，distribution.mode 保持 inline，数据放在 records。
2. schema.record_count 必须严格等于 records.length，记录 id 不得重复。
3. ${recordRule}
4. 不得编造事实；未知文本填空字符串，未知数字填 null。音乐的未知播放来源使用 provider=none、url=""。
5. 个人数据使用 privacy=private，provenance 写明真实来源和许可。
6. 地点只有在来源可靠时才写，坐标使用 WGS84。
7. 输出纯 JSON，不要 Markdown 代码围栏或解释文字。`;
}
