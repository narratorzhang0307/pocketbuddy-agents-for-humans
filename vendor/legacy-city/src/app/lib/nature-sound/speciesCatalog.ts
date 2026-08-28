import type { CityCharacterScene } from '../../components/CityCharacterCard';
import type { NatureSoundAnimalGroup, NatureSoundDetection } from './types';

export type NatureSoundSpeciesProfile = {
  speciesId: string;
  commonName: string;
  scientificName: string;
  englishName: string;
  familyLabel: string;
  orderLabel: string;
  group: NatureSoundAnimalGroup;
  assetSlug: string;
  accent: string;
  scene: CityCharacterScene;
  activeTimeLabel: string;
  soundProfile: string;
  description: string;
  distributionLabel: string;
  habitatLabel: string;
  behaviorLabel: string;
  protectionStatus: string;
};

export const NATURE_SOUND_SPECIES: readonly NatureSoundSpeciesProfile[] = [
  {
    speciesId: 'pycnonotus-sinensis', commonName: '白头鹎', scientificName: 'Pycnonotus sinensis', englishName: 'Light-vented Bulbul',
    familyLabel: '鹎科', orderLabel: '雀形目', group: 'bird', assetSlug: 'light-vented-bulbul', accent: '#f2b84b', scene: 'willow',
    activeTimeLabel: '晨昏活跃', soundProfile: '清亮、多变，常连续发出短促鸣句。',
    description: '头顶黑、枕部有醒目的白斑，是杭州树冠和城市绿地里常见的鸣禽。',
    distributionLabel: '华东常见留鸟', habitatLabel: '林缘、湖岸、城市绿地', behaviorLabel: '结小群，在树冠取食果实与昆虫', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'cuculus-canorus', commonName: '大杜鹃', scientificName: 'Cuculus canorus', englishName: 'Common Cuckoo',
    familyLabel: '杜鹃科', orderLabel: '鹃形目', group: 'bird', assetSlug: 'common-cuckoo', accent: '#7f96b9', scene: 'lakebridge',
    activeTimeLabel: '春夏鸣叫', soundProfile: '雄鸟常发出两音节、重复而有穿透力的“布谷”声。',
    description: '灰色上体与横斑腹部很有辨识度，常先听到声音，随后才在高处发现它。',
    distributionLabel: '杭州春夏候鸟', habitatLabel: '林地、湿地边缘与开阔灌丛', behaviorLabel: '多独栖，常停在突出枝头鸣叫', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'urocissa-erythroryncha', commonName: '红嘴蓝鹊', scientificName: 'Urocissa erythroryncha', englishName: 'Red-billed Blue Magpie',
    familyLabel: '鸦科', orderLabel: '雀形目', group: 'bird', assetSlug: 'red-billed-blue-magpie', accent: '#3789d5', scene: 'willow',
    activeTimeLabel: '日间活跃', soundProfile: '响亮粗哑，叫声变化多，群体联络时尤其醒目。',
    description: '红嘴红脚、蓝色长尾，是体形大而醒目的林缘鸟类。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '山林、林缘与大型公园', behaviorLabel: '家族小群活动，机警而好奇', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'passer-montanus', commonName: '麻雀', scientificName: 'Passer montanus', englishName: 'Eurasian Tree Sparrow',
    familyLabel: '雀科', orderLabel: '雀形目', group: 'bird', assetSlug: 'eurasian-tree-sparrow', accent: '#b97a4e', scene: 'lakebridge',
    activeTimeLabel: '日间活跃', soundProfile: '短促的“叽、叽”联络声，常由多只个体交叠出现。',
    description: '栗色头顶、白颊黑斑和黑色喉斑，是最熟悉的城市邻居之一。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '街区、农田、园林与建筑周边', behaviorLabel: '群居，常在地面跳跃取食', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'caprimulgus-indicus', commonName: '普通夜鹰', scientificName: 'Caprimulgus indicus', englishName: 'Grey Nightjar',
    familyLabel: '夜鹰科', orderLabel: '夜鹰目', group: 'bird', assetSlug: 'grey-nightjar', accent: '#8d725d', scene: 'night',
    activeTimeLabel: '黄昏与夜间', soundProfile: '夜间持续而有节律的颤音或敲击般鸣声。',
    description: '灰褐斑驳羽色像树皮，白天伏卧隐蔽，夜间飞出捕食昆虫。',
    distributionLabel: '杭州夏候鸟', habitatLabel: '疏林、林缘与开阔坡地', behaviorLabel: '夜行，飞行轻捷，常贴近地面', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'horornis-fortipes', commonName: '强脚树莺', scientificName: 'Horornis fortipes', englishName: 'Brown-flanked Bush Warbler',
    familyLabel: '树莺科', orderLabel: '雀形目', group: 'bird', assetSlug: 'brown-flanked-bush-warbler', accent: '#9b8b4b', scene: 'willow',
    activeTimeLabel: '清晨活跃', soundProfile: '短促前奏后接响亮爆发音，常从浓密灌丛中传出。',
    description: '橄榄褐色小鸟，淡眉纹、棕色胁部和有力的腿是观察要点。',
    distributionLabel: '杭州山林常见留鸟', habitatLabel: '林下灌丛、竹林与山溪边', behaviorLabel: '隐蔽穿行，常翘尾并在低枝鸣唱', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'copsychus-saularis', commonName: '鹊鸲', scientificName: 'Copsychus saularis', englishName: 'Oriental Magpie-Robin',
    familyLabel: '鹟科', orderLabel: '雀形目', group: 'bird', assetSlug: 'oriental-magpie-robin', accent: '#2d5079', scene: 'lakebridge',
    activeTimeLabel: '晨间鸣唱', soundProfile: '音色清亮、句式多变，常模仿或重复不同短句。',
    description: '黑白分明、翼上有大白斑，长尾常上翘，是出色的城市歌手。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '园林、村落、林缘与水边', behaviorLabel: '单独或成对活动，常在开阔枝头鸣唱', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'turdus-mandarinus', commonName: '乌鸫', scientificName: 'Turdus mandarinus', englishName: 'Chinese Blackbird',
    familyLabel: '鸫科', orderLabel: '雀形目', group: 'bird', assetSlug: 'chinese-blackbird', accent: '#e2963b', scene: 'lotus',
    activeTimeLabel: '清晨与傍晚', soundProfile: '圆润响亮的笛音组成连续乐句，也会发出急促警戒声。',
    description: '雄鸟通体黑色，黄色嘴和眼圈醒目，常在草地翻找蚯蚓。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '林地、草坪、公园与居民区', behaviorLabel: '多在地面快走、停顿并翻叶取食', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'pica-serica', commonName: '喜鹊', scientificName: 'Pica serica', englishName: 'Oriental Magpie',
    familyLabel: '鸦科', orderLabel: '雀形目', group: 'bird', assetSlug: 'oriental-magpie', accent: '#4e647b', scene: 'lakebridge',
    activeTimeLabel: '日间活跃', soundProfile: '粗哑、快速重复的“喳喳”声，远距离也容易听见。',
    description: '大型黑白鸟，长尾带蓝绿色金属光泽，适应城市与乡野多种环境。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '开阔林地、农田、城市绿地', behaviorLabel: '成对或小群活动，善于利用高处观察', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'spilopelia-chinensis', commonName: '珠颈斑鸠', scientificName: 'Spilopelia chinensis', englishName: 'Spotted Dove',
    familyLabel: '鸠鸽科', orderLabel: '鸽形目', group: 'bird', assetSlug: 'spotted-dove', accent: '#c68c79', scene: 'lotus',
    activeTimeLabel: '晨昏活跃', soundProfile: '低沉、重复的多音节咕咕声，节奏平稳。',
    description: '颈侧黑斑上密布白色珠点，常安静停在电线、树枝或草地。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '园林、街区、农田与林缘', behaviorLabel: '成对或小群，在地面取食种子', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'lanius-schach', commonName: '棕背伯劳', scientificName: 'Lanius schach', englishName: 'Long-tailed Shrike',
    familyLabel: '伯劳科', orderLabel: '雀形目', group: 'bird', assetSlug: 'long-tailed-shrike', accent: '#bc704c', scene: 'willow',
    activeTimeLabel: '日间活跃', soundProfile: '粗厉的警戒声夹杂多变模仿声，常从高处发出。',
    description: '黑色贯眼纹、棕色背和长尾明显，弯钩状嘴显示其捕食习性。',
    distributionLabel: '杭州常见留鸟', habitatLabel: '林缘、农田、公园与灌丛', behaviorLabel: '停在高处守望，俯冲捕捉昆虫和小动物', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'abroscopus-albogularis', commonName: '棕脸鹟莺', scientificName: 'Abroscopus albogularis', englishName: 'Rufous-faced Warbler',
    familyLabel: '树莺科', orderLabel: '雀形目', group: 'bird', assetSlug: 'rufous-faced-warbler', accent: '#d09a55', scene: 'willow',
    activeTimeLabel: '清晨活跃', soundProfile: '细高、快速的短句，常在枝叶间连续鸣叫。',
    description: '体形很小，棕红色脸颊、白喉和黄绿色上体是识别重点。',
    distributionLabel: '杭州山林常见鸟', habitatLabel: '湿润林地、竹林与溪谷灌丛', behaviorLabel: '活跃穿梭叶丛，捕食细小昆虫', protectionStatus: '国家“三有”保护动物',
  },
  {
    speciesId: 'mecopoda-elongata', commonName: '纺织娘', scientificName: 'Mecopoda elongata', englishName: 'Long-horned Grasshopper',
    familyLabel: '织娘科', orderLabel: '直翅目', group: 'insect', assetSlug: 'long-horned-grasshopper', accent: '#76a95a', scene: 'greenhouse',
    activeTimeLabel: '夏秋夜间', soundProfile: '连续、均匀而响亮的摩擦鸣声，像纺车转动。',
    description: '叶状绿色身体与极长触角适合藏在草丛和灌木叶面。',
    distributionLabel: '杭州夏秋常见', habitatLabel: '灌丛、草地与林缘', behaviorLabel: '夜间雄虫摩擦前翅鸣叫求偶', protectionStatus: '城市常见鸣虫',
  },
  {
    speciesId: 'cryptotympana-atrata', commonName: '黑蚱蝉', scientificName: 'Cryptotympana atrata', englishName: 'Black Cicada',
    familyLabel: '蝉科', orderLabel: '半翅目', group: 'insect', assetSlug: 'black-cicada', accent: '#526b67', scene: 'willow',
    activeTimeLabel: '盛夏日间', soundProfile: '音量很高、持续成片的蝉鸣，远处也可听见。',
    description: '大型黑色蝉，透明翅脉清晰，是杭州盛夏声景的重要成员。',
    distributionLabel: '杭州夏季常见', habitatLabel: '高大乔木、林带与公园', behaviorLabel: '雄虫停在树干和高枝上鸣叫', protectionStatus: '城市常见鸣虫',
  },
  {
    speciesId: 'teleogryllus-emma', commonName: '黄脸油葫芦', scientificName: 'Teleogryllus emma', englishName: 'Emma Field Cricket',
    familyLabel: '蟋蟀科', orderLabel: '直翅目', group: 'insect', assetSlug: 'emma-field-cricket', accent: '#c58a3b', scene: 'night',
    activeTimeLabel: '夏秋夜间', soundProfile: '圆润响亮、分段重复的蟋蟀鸣声。',
    description: '深褐色身体配淡黄色脸部，常隐身于草根、石缝和土洞附近。',
    distributionLabel: '杭州夏秋常见', habitatLabel: '草地、田埂、庭院与路边', behaviorLabel: '夜间在洞口附近振翅鸣叫', protectionStatus: '城市常见鸣虫',
  },
  {
    speciesId: 'meimuna-mongolica', commonName: '蒙古寒蝉', scientificName: 'Meimuna mongolica', englishName: 'Mongolian Cicada',
    familyLabel: '蝉科', orderLabel: '半翅目', group: 'insect', assetSlug: 'mongolian-cicada', accent: '#709876', scene: 'willow',
    activeTimeLabel: '夏末至秋季', soundProfile: '节律鲜明的持续鸣声，音色比大型蚱蝉更清亮。',
    description: '绿色与褐色相间的中型蝉，鸣期常延续到天气转凉时。',
    distributionLabel: '杭州夏末秋初可闻', habitatLabel: '林地、公园与山坡乔木', behaviorLabel: '雄虫栖于树干或枝条鸣叫', protectionStatus: '城市常见鸣虫',
  },
  {
    speciesId: 'velarifictorus-micado', commonName: '迷卡斗蟋', scientificName: 'Velarifictorus micado', englishName: 'Micado Cricket',
    familyLabel: '蟋蟀科', orderLabel: '直翅目', group: 'insect', assetSlug: 'micado-cricket', accent: '#795a4d', scene: 'night',
    activeTimeLabel: '夏秋夜间', soundProfile: '连续密集的短脉冲鸣声，常从地表覆盖物下传出。',
    description: '褐色地栖蟋蟀，头部纹理与粗壮后足适合在落叶层活动。',
    distributionLabel: '杭州夏秋可闻', habitatLabel: '草丛、落叶层与石缝', behaviorLabel: '夜行，雄虫摩擦前翅发声', protectionStatus: '城市常见鸣虫',
  },
  {
    speciesId: 'pelophylax-nigromaculatus', commonName: '黑斑侧褶蛙', scientificName: 'Pelophylax nigromaculatus', englishName: 'Dark-spotted Frog',
    familyLabel: '蛙科', orderLabel: '无尾目', group: 'frog', assetSlug: 'dark-spotted-frog', accent: '#5a9e62', scene: 'pond',
    activeTimeLabel: '春夏夜间', soundProfile: '响亮短促、略带金属感的重复叫声。',
    description: '绿色或褐绿色背面有深色斑点，两侧背褶明显，常见于静水边。',
    distributionLabel: '杭州湿地常见', habitatLabel: '池塘、稻田、沟渠与浅水岸边', behaviorLabel: '水陆两栖，受惊后迅速跃入水中', protectionStatus: '请勿捕捉，保护湿地栖息地',
  },
  {
    speciesId: 'nidirana-mangveni', commonName: '孟闻琴蛙', scientificName: 'Nidirana mangveni', englishName: 'Mangshan Music Frog',
    familyLabel: '蛙科', orderLabel: '无尾目', group: 'frog', assetSlug: 'mangveni-music-frog', accent: '#92705f', scene: 'pond',
    activeTimeLabel: '春夏夜间', soundProfile: '音符感强、间隔清楚，像拨动琴弦的短声。',
    description: '体色棕褐，背侧褶清楚，雄蛙鸣叫富有“琴声”般的节奏感。',
    distributionLabel: '杭州局部湿润环境可闻', habitatLabel: '水塘、溪沟与湿润草丛', behaviorLabel: '繁殖期雄蛙在水边占据鸣叫位点', protectionStatus: '请减少夜间灯光与岸边干扰',
  },
  {
    speciesId: 'microhyla-fissipes', commonName: '饰纹姬蛙', scientificName: 'Microhyla fissipes', englishName: 'Ornate Pygmy Frog',
    familyLabel: '姬蛙科', orderLabel: '无尾目', group: 'frog', assetSlug: 'ornate-pygmy-frog', accent: '#b68b56', scene: 'pond',
    activeTimeLabel: '雨后夜间', soundProfile: '细密、快速而持续的高音叫声，常多只合唱。',
    description: '体形很小，背面深浅相间的箭形或花纹醒目，雨后容易听见。',
    distributionLabel: '杭州低海拔湿地可闻', habitatLabel: '稻田、草地积水与池塘边', behaviorLabel: '雨后集中活动，常藏在低矮植被中', protectionStatus: '请保留季节性浅水与草丛',
  },
  {
    speciesId: 'fejervarya-multistriata', commonName: '泽陆蛙', scientificName: 'Fejervarya multistriata', englishName: 'Asian Grass Frog',
    familyLabel: '叉舌蛙科', orderLabel: '无尾目', group: 'frog', assetSlug: 'rice-field-frog', accent: '#8d8552', scene: 'pond',
    activeTimeLabel: '春夏夜间', soundProfile: '低而短促、连续重复的叫声，常组成稻田夜间合唱。',
    description: '棕褐色小型蛙，背部有不规则深色纹，善于在泥岸和草间隐蔽。',
    distributionLabel: '杭州低地常见', habitatLabel: '稻田、水沟、池塘与湿草地', behaviorLabel: '贴近地表活动，繁殖期在浅水边鸣叫', protectionStatus: '请减少农药并保护浅水生境',
  },
] as const;

export const NATURE_SOUND_REFERENCE_AUDIO_BASE =
  'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/shengsheng-buxi/standard-audio/v1';

const REFERENCE_AUDIO_EXTENSION_BY_SPECIES: Readonly<Record<string, 'mp3' | 'wav'>> = {
  'pelophylax-nigromaculatus': 'mp3',
  'nidirana-mangveni': 'wav',
};

export function natureSoundReferenceAudioUrl(
  species: Pick<NatureSoundSpeciesProfile, 'speciesId' | 'group'>,
) {
  const extension = REFERENCE_AUDIO_EXTENSION_BY_SPECIES[species.speciesId] ?? 'm4a';
  return `${NATURE_SOUND_REFERENCE_AUDIO_BASE}/${species.group}/${species.speciesId}.${extension}`;
}

const normalizedName = (value?: string) => value?.trim().toLowerCase().replace(/[\s_]+/g, '-') ?? '';

export function findNatureSoundSpecies(value: Pick<NatureSoundDetection, 'speciesId' | 'commonName' | 'scientificName'>) {
  const keys = new Set([
    normalizedName(value.speciesId),
    normalizedName(value.commonName),
    normalizedName(value.scientificName),
  ]);
  return NATURE_SOUND_SPECIES.find((profile) => (
    keys.has(normalizedName(profile.speciesId))
    || keys.has(normalizedName(profile.commonName))
    || keys.has(normalizedName(profile.scientificName))
    || (profile.commonName === '泽陆蛙' && keys.has(normalizedName('泽路蛙')))
    || (profile.commonName === '普通夜鹰' && keys.has(normalizedName('普通夜莺')))
  ));
}

export function speciesFrameUrl(assetSlug: string, action: 'listen' | 'call' | 'hop' | 'rest' = 'listen') {
  const profile = NATURE_SOUND_SPECIES.find((species) => species.assetSlug === assetSlug);
  const frameDirectory = profile?.group === 'bird' ? 'frames-clean' : 'frames';
  return `/assets/shengsheng-species/${assetSlug}/${frameDirectory}/${action}.png`;
}

export function enrichNatureSoundDetection(detection: NatureSoundDetection): NatureSoundDetection {
  const profile = findNatureSoundSpecies(detection);
  if (!profile) return detection;
  return {
    ...detection,
    speciesId: profile.speciesId,
    commonName: profile.commonName,
    scientificName: detection.scientificName ?? profile.scientificName,
    englishName: detection.englishName ?? profile.englishName,
    familyLabel: detection.familyLabel ?? profile.familyLabel,
    orderLabel: detection.orderLabel ?? profile.orderLabel,
    group: profile.group,
    activeTimeLabel: detection.activeTimeLabel ?? profile.activeTimeLabel,
    soundProfile: detection.soundProfile ?? profile.soundProfile,
    description: detection.description ?? profile.description,
    distributionLabel: detection.distributionLabel ?? profile.distributionLabel,
    habitatLabel: detection.habitatLabel ?? profile.habitatLabel,
    behaviorLabel: detection.behaviorLabel ?? profile.behaviorLabel,
    protectionStatus: detection.protectionStatus ?? profile.protectionStatus,
    assetSlug: profile.assetSlug,
    imageUrl: speciesFrameUrl(profile.assetSlug),
  };
}

export function catalogPreviewDetection(profile: NatureSoundSpeciesProfile): NatureSoundDetection {
  return enrichNatureSoundDetection({
    id: `catalog-${profile.speciesId}`,
    speciesId: profile.speciesId,
    commonName: profile.commonName,
    scientificName: profile.scientificName,
    group: profile.group,
    confidence: 0,
  });
}
