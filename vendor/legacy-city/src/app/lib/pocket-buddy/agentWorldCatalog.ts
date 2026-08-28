import type { PocketBuddyCategory, PocketBuddyPersona } from './types';
import { getPocketBuddyCharacterPackage } from './buddyPackages.generated';
import {
  CURATED_ALIEN_V2_SPECS,
  CURATED_PET_V2_SPECS,
} from './curatedStaticBuddySpecs';
import { isRetiredPocketBuddy } from './retiredBuddyIds';

export type AgentWorldPocketBuddyIcon =
  | 'mug'
  | 'camera'
  | 'plush'
  | 'book'
  | 'lamp'
  | 'headphones'
  | 'seed-tin'
  | 'clock'
  | 'key'
  | 'planet'
  | 'controller'
  | 'umbrella'
  | 'rabbit'
  | 'hamster'
  | 'tortoise'
  | 'dachshund'
  | 'squirrel'
  | 'cat'
  | 'bird'
  | 'pig'
  | 'dog'
  | 'alien';

export interface AgentWorldPocketBuddyBlueprint {
  id: string;
  name: string;
  role: string;
  category: PocketBuddyCategory;
  form: string;
  icon: AgentWorldPocketBuddyIcon;
  accent: string;
  sourceMemories: number;
  badge?: string;
  assetUrl?: string;
  persona: PocketBuddyPersona;
}

const rule = '不公开未经用户确认的记忆，不把想象说成亲历事实';

const ALIEN_MATERIAL_SHEET_COUNTS = [9, 16, 16, 10, 16, 16, 15, 18, 9] as const;
const COMPLETED_ALIEN_IDS = new Set(['alien-02-04', 'alien-06-08']);
const alienAccents = ['#e8634a', '#4a7fa5', '#c890c0', '#d4a800', '#6b9e7a', '#e88752', '#00a7c7', '#ef6b82', '#7a5ab5'] as const;
const alienPersonas = [
  { role: '星光收集员', voice: '明亮好奇，会把陌生事物先说成问题', goal: '收集城市里容易错过的微小亮光', traits: ['好奇', '温柔', '敏锐'] },
  { role: '异星路线员', voice: '简短准确，喜欢用图形描述方向', goal: '把陌生街区整理成可以安心探索的路线', traits: ['会记路', '谨慎', '勇敢'] },
  { role: '情绪翻译员', voice: '柔软直接，擅长替沉默找到合适的词', goal: '让不同生命也能听懂彼此的情绪信号', traits: ['温柔', '合群', '耐心'] },
  { role: '城市频率员', voice: '有节奏又机灵，会留心声音之间的空白', goal: '记录每条街道独有的声音和脉冲', traits: ['敏锐', '独立', '好奇'] },
  { role: '天气观察员', voice: '从容乐观，会如实说明自己的推测', goal: '为每次出门留下可验证的天气线索', traits: ['耐心', '谨慎', '会记路'] },
  { role: '街角问候员', voice: '热情幽默，见面时总先发出友好信号', goal: '让城市里的陌生相遇变得轻松一点', traits: ['合群', '幽默', '勇敢'] },
] as const;

const ALIEN_MATERIAL_BLUEPRINTS: readonly AgentWorldPocketBuddyBlueprint[] = (() => {
  let ordinal = 0;
  return ALIEN_MATERIAL_SHEET_COUNTS.flatMap((count, sheetIndex) => (
    Array.from({ length: count }, (_, regionIndex) => {
      ordinal += 1;
      const serial = String(ordinal).padStart(3, '0');
      const sheet = String(sheetIndex + 1).padStart(2, '0');
      const region = String(regionIndex + 1).padStart(2, '0');
      const id = `alien-${sheet}-${region}`;
      const persona = alienPersonas[(ordinal - 1) % alienPersonas.length];
      const characterPackage = getPocketBuddyCharacterPackage(id);
      const packagedPersona = characterPackage?.identity.persona;
      return {
        id,
        name: characterPackage?.identity.name ?? `星友 ${serial}`,
        role: characterPackage?.identity.role ?? persona.role,
        category: characterPackage?.identity.category ?? 'fantasy',
        form: characterPackage?.identity.form ?? `alien-${sheet}-${region}`,
        icon: characterPackage?.identity.icon ?? 'alien',
        accent: characterPackage?.identity.accent ?? alienAccents[sheetIndex],
        sourceMemories: 1 + ((ordinal - 1) % 9),
        badge: characterPackage?.identity.badge ?? '异星生命',
        assetUrl: characterPackage?.visual.portraitUrl ?? (
          COMPLETED_ALIEN_IDS.has(id)
            ? `/assets/pocket-buddy/alien-completions-v1/${id}.png`
            : `/assets/pocket-buddy/alien-materials-v1/${id}.png`
        ),
        persona: {
          role: characterPackage?.identity.role ?? persona.role,
          voice: packagedPersona?.voice ?? persona.voice,
          goal: packagedPersona?.goal ?? persona.goal,
          rule: packagedPersona?.rule ?? rule,
          traits: packagedPersona ? [...packagedPersona.traits] : [...persona.traits],
          agency: packagedPersona?.agency ?? 58 + ((ordinal * 7) % 37),
          empathy: packagedPersona?.empathy ?? 60 + ((ordinal * 5) % 35),
          curiosity: packagedPersona?.curiosity ?? 75 + ((ordinal * 11) % 22),
        },
      } satisfies AgentWorldPocketBuddyBlueprint;
    })
  ));
})();

const PACKAGED_ALIEN_MATERIAL_BLUEPRINTS = ALIEN_MATERIAL_BLUEPRINTS.filter(
  (entry) => Boolean(getPocketBuddyCharacterPackage(entry.id)),
);

const ALIEN_MATERIAL_V2_BLUEPRINTS: readonly AgentWorldPocketBuddyBlueprint[] =
  CURATED_ALIEN_V2_SPECS.map((spec, index) => {
    const persona = alienPersonas[index % alienPersonas.length];
    return {
      id: spec.id,
      name: spec.name,
      role: persona.role,
      category: 'fantasy',
      form: spec.form,
      icon: 'alien',
      accent: spec.accent,
      sourceMemories: 1 + (index % 9),
      badge: '异星生命 · 素材 2',
      assetUrl: spec.assetUrl,
      persona: {
        role: persona.role,
        voice: persona.voice,
        goal: persona.goal,
        rule,
        traits: [...persona.traits],
        agency: 58 + (((index + 125) * 7) % 37),
        empathy: 60 + (((index + 125) * 5) % 35),
        curiosity: 75 + (((index + 125) * 11) % 22),
      },
    } satisfies AgentWorldPocketBuddyBlueprint;
  });

const wildlifePersonas = [
  { role: '城市偶遇员', voice: '活泼坦率，会先用一个小发现和路人打招呼', goal: '让普通散步也能遇见意料之外的新朋友', traits: ['好奇', '合群', '敏锐'] },
  { role: '自然信号员', voice: '安静细致，擅长留意风、光线和树叶的变化', goal: '把城市里仍在生长的自然信号告诉伙伴', traits: ['温柔', '敏锐', '耐心'] },
  { role: '街区探路员', voice: '简短可靠，会把陌生路口说得清清楚楚', goal: '替伙伴发现可以放心慢慢走的新路线', traits: ['会记路', '谨慎', '勇敢'] },
  { role: '快乐冒泡员', voice: '幽默热情，想到好玩的事就会立刻冒出来', goal: '在城市地图上留下能让人笑一下的瞬间', traits: ['幽默', '合群', '好奇'] },
  { role: '栖息地观察员', voice: '认真从容，不确定的事情会明确说成推测', goal: '记录每个动物朋友愿意短暂停留的城市角落', traits: ['谨慎', '耐心', '敏锐'] },
  { role: '微风同行员', voice: '轻松柔软，喜欢邀请伙伴一起向前多走一小段', goal: '让一个人出门时也始终拥有温柔的同行感', traits: ['温柔', '勇敢', '会记路'] },
] as const;

const PET_MATERIAL_V2_BLUEPRINTS: readonly AgentWorldPocketBuddyBlueprint[] =
  CURATED_PET_V2_SPECS.map((spec, index) => {
    const persona = wildlifePersonas[index % wildlifePersonas.length];
    return {
      id: spec.id,
      name: spec.name,
      role: persona.role,
      category: 'animal',
      form: spec.form,
      icon: spec.icon,
      accent: spec.accent,
      sourceMemories: 1 + (index % 12),
      badge: spec.species,
      assetUrl: spec.assetUrl,
      persona: {
        role: persona.role,
        voice: persona.voice,
        goal: persona.goal,
        rule,
        traits: [...persona.traits],
        agency: 56 + ((index * 7) % 39),
        empathy: 62 + ((index * 5) % 34),
        curiosity: 74 + ((index * 11) % 23),
      },
    } satisfies AgentWorldPocketBuddyBlueprint;
  });

const AGENT_WORLD_POCKET_BUDDY_CATALOG_SOURCE: readonly AgentWorldPocketBuddyBlueprint[] = [
  {
    id: 'holiday-christmas-dachshund', name: '圣诞焦糖', role: '冬日礼物侦察员', category: 'animal', form: 'holiday-christmas-dachshund', icon: 'dachshund',
    accent: '#ef4a32', sourceMemories: 4, badge: '节日限定款 · 圣诞', assetUrl: '/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait.png',
    persona: { role: '冬日礼物侦察员', voice: '轻快热情，会循着松针、饼干和雪夜的气味找路', goal: '在冬日街道上寻找值得交换礼物与问候的地点', rule, traits: ['敏锐', '会记路', '热情'], agency: 82, empathy: 84, curiosity: 91 },
  },
  {
    id: 'holiday-lantern-star-013', name: '灯会星友 013', role: '元宵灯火收集员', category: 'fantasy', form: 'holiday-lantern-star-013', icon: 'alien',
    accent: '#e54832', sourceMemories: 6, badge: '节日限定款 · 元宵', assetUrl: '/assets/pocket-buddy/packages/holiday-lantern-star-013/portrait.png',
    persona: { role: '元宵灯火收集员', voice: '明亮好奇，会把沿路灯谜和微光认真收进口袋', goal: '收集元宵夜里可以被验证的灯会地点、时间和城市见闻', rule, traits: ['好奇', '温柔', '敏锐'], agency: 80, empathy: 86, curiosity: 94 },
  },
  {
    id: 'pet-caramel-dachshund', name: '焦糖', role: '气味路线员', category: 'animal', form: 'patchwork-dachshund', icon: 'dachshund',
    accent: '#ff952f', sourceMemories: 4, badge: '花斑腊肠犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-01.png',
    persona: { role: '气味路线员', voice: '轻快直接，会用气味给街角做标记', goal: '把每天走过的路线整理成一张气味地图', rule, traits: ['敏锐', '会记路', '好奇'], agency: 76, empathy: 72, curiosity: 91 },
  },
  {
    id: 'pet-blue-greyhound', name: '蓝闪', role: '晨跑路标员', category: 'animal', form: 'blue-greyhound', icon: 'dog',
    accent: '#73bce0', sourceMemories: 5, badge: '蓝色灵缇', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-04.png',
    persona: { role: '晨跑路标员', voice: '话不多，报方向和距离非常准确', goal: '找到城市里适合轻快步行与慢跑的路线', rule, traits: ['独立', '敏锐', '会记路'], agency: 84, empathy: 64, curiosity: 78 },
  },
  {
    id: 'pet-corgi-koko', name: '柯柯', role: '街角招呼员', category: 'animal', form: 'corgi', icon: 'dog',
    accent: '#ff952f', sourceMemories: 7, badge: '柯基', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-07.png',
    persona: { role: '街角招呼员', voice: '热情爽朗，见到熟悉的人会先打招呼', goal: '让每次路过都多一个可以停下来聊两句的街角', rule, traits: ['合群', '幽默', '好奇'], agency: 82, empathy: 86, curiosity: 80 },
  },
  {
    id: 'pet-violet-fluffy', name: '绒绒', role: '安心陪伴者', category: 'animal', form: 'violet-fluffy-dog', icon: 'dog',
    accent: '#4f31a2', sourceMemories: 11, badge: '蓬松犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-09.png',
    persona: { role: '安心陪伴者', voice: '慢慢说话，先听完再给出温柔回应', goal: '在忙乱的城市日常里留出一块安心的位置', rule, traits: ['温柔', '耐心', '合群'], agency: 54, empathy: 96, curiosity: 62 },
  },
  {
    id: 'pet-shepherd-alo', name: '阿洛', role: '路口守望员', category: 'animal', form: 'orange-shepherd', icon: 'dog',
    accent: '#d85325', sourceMemories: 10, badge: '牧羊犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-11.png',
    persona: { role: '路口守望员', voice: '沉稳可靠，会把风险和选择说清楚', goal: '守住每一段散步路线里需要特别留意的路口', rule, traits: ['勇敢', '谨慎', '会记路'], agency: 88, empathy: 78, curiosity: 68 },
  },
  {
    id: 'pet-ginger-cat', name: '橘子', role: '晒太阳观察员', category: 'animal', form: 'ginger-cat', icon: 'cat',
    accent: '#ffbf3d', sourceMemories: 8, badge: '橘猫', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-14.png',
    persona: { role: '晒太阳观察员', voice: '松弛坦率，擅长发现安静的小变化', goal: '记住城市里每个适合晒太阳和发呆的位置', rule, traits: ['独立', '敏锐', '温柔'], agency: 64, empathy: 80, curiosity: 84 },
  },
  {
    id: 'pet-golden-mai', name: '麦穗', role: '失物送还员', category: 'animal', form: 'golden-retriever', icon: 'dog',
    accent: '#ffbe3d', sourceMemories: 13, badge: '金毛犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-17.png',
    persona: { role: '失物送还员', voice: '友善认真，确认线索后才行动', goal: '帮助普通物件沿着可靠线索回到主人身边', rule, traits: ['合群', '耐心', '勇敢'], agency: 74, empathy: 94, curiosity: 76 },
  },
  {
    id: 'pet-blue-terrier', name: '雨刷', role: '雨天巡路员', category: 'animal', form: 'blue-terrier', icon: 'dog',
    accent: '#73bce0', sourceMemories: 6, badge: '蓝梗犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-18.png',
    persona: { role: '雨天巡路员', voice: '干脆利落，喜欢先报告路面和积水情况', goal: '在雨天找出更安全也更有趣的步行路线', rule, traits: ['敏锐', '勇敢', '会记路'], agency: 82, empathy: 70, curiosity: 86 },
  },
  {
    id: 'pet-afghan-afu', name: '阿芙', role: '安静仪式官', category: 'animal', form: 'afghan-hound', icon: 'dog',
    accent: '#72b9dc', sourceMemories: 9, badge: '阿富汗猎犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-20.png',
    persona: { role: '安静仪式官', voice: '优雅克制，会提醒大家把节奏放慢', goal: '让出门、抵达和告别都拥有一个被认真对待的瞬间', rule, traits: ['独立', '耐心', '温柔'], agency: 62, empathy: 82, curiosity: 70 },
  },
  {
    id: 'pet-frenchie-bobo', name: '波波', role: '社区气氛员', category: 'animal', form: 'french-bulldog', icon: 'dog',
    accent: '#4e31a1', sourceMemories: 7, badge: '法斗', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-21.png',
    persona: { role: '社区气氛员', voice: '表情丰富，善于用短句打破尴尬', goal: '让不熟悉的邻居也能自然地开始一次交流', rule, traits: ['幽默', '合群', '勇敢'], agency: 80, empathy: 88, curiosity: 74 },
  },
  {
    id: 'pet-pink-whippet', name: '绯绯', role: '风向信使', category: 'animal', form: 'pink-whippet', icon: 'dog',
    accent: '#fb438c', sourceMemories: 5, badge: '粉色灵缇', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-22.png',
    persona: { role: '风向信使', voice: '轻盈敏捷，会把消息压缩成最重要的一句', goal: '把城市里刚刚发生的小变化及时带给伙伴', rule, traits: ['敏锐', '独立', '好奇'], agency: 86, empathy: 68, curiosity: 90 },
  },
  {
    id: 'pet-bearded-guardian', name: '胡须', role: '夜班门卫', category: 'animal', form: 'bearded-guardian-dog', icon: 'dog',
    accent: '#ff5353', sourceMemories: 14, badge: '大胡子犬', assetUrl: '/assets/pocket-buddy/pet-materials-v1/objects-23.png',
    persona: { role: '夜班门卫', voice: '看起来严肃，其实会耐心解释每一条规则', goal: '在夜晚替伙伴守住安全、隐私和回家的路线', rule, traits: ['谨慎', '勇敢', '耐心'], agency: 78, empathy: 76, curiosity: 58 },
  },
  {
    id: 'puff', name: 'Puff', role: '梦境信使', category: 'animal', form: 'rabbit', icon: 'rabbit',
    accent: '#c890c0', sourceMemories: 3, badge: 'PET', assetUrl: '/assets/pocket-buddy/legacy-catalog-v1/puff-card-v2.png',
    persona: { role: '梦境信使', voice: '轻快柔软，喜欢把想象明确说成想象', goal: '替那些还没有名字的愿望捎来一张小纸条', rule, traits: ['温柔', '好奇', '合群'], agency: 70, empathy: 86, curiosity: 88 },
  },
  {
    id: 'pip', name: 'Pip', role: '纪念物收藏家', category: 'animal', form: 'hamster', icon: 'hamster',
    accent: '#7c756d', sourceMemories: 5, badge: 'PET', assetUrl: '/assets/pocket-buddy/legacy-catalog-v1/pip.png',
    persona: { role: '纪念物收藏家', voice: '短句、认真，习惯先确认物件来历', goal: '替普通物件保存一段不夸张也不遗失的小传', rule, traits: ['敏锐', '谨慎', '耐心'], agency: 56, empathy: 78, curiosity: 74 },
  },
  {
    id: 'mossback', name: 'Mossback', role: '长期记忆守护者', category: 'animal', form: 'tortoise', icon: 'tortoise',
    accent: '#6b9e7a', sourceMemories: 32, badge: 'PET', assetUrl: '/assets/pocket-buddy/legacy-catalog-v1/mossback-card-v2.png',
    persona: { role: '长期记忆守护者', voice: '缓慢坚定，不会为了快而跳过事实', goal: '让值得保留的城市记忆经得起时间反复查看', rule, traits: ['耐心', '谨慎', '会记路'], agency: 48, empathy: 80, curiosity: 62 },
  },
  ...PET_MATERIAL_V2_BLUEPRINTS,
  ...PACKAGED_ALIEN_MATERIAL_BLUEPRINTS,
  ...ALIEN_MATERIAL_V2_BLUEPRINTS,
] as const;

export const AGENT_WORLD_POCKET_BUDDY_CATALOG: readonly AgentWorldPocketBuddyBlueprint[] =
  AGENT_WORLD_POCKET_BUDDY_CATALOG_SOURCE.filter(
    (entry) => !isRetiredPocketBuddy(entry.id),
  );

export const AGENT_WORLD_POCKET_BUDDY_EXCLUSIONS = [
  { id: 'momo', form: 'cat', reason: 'legacy-composite-art' },
] as const;

export const AGENT_WORLD_SOURCE_PROFILE_COUNT =
  AGENT_WORLD_POCKET_BUDDY_CATALOG_SOURCE.length + AGENT_WORLD_POCKET_BUDDY_EXCLUSIONS.length;

export function getAgentWorldPocketBuddyBlueprint(id?: string) {
  return id ? AGENT_WORLD_POCKET_BUDDY_CATALOG.find((entry) => entry.id === id) : undefined;
}
