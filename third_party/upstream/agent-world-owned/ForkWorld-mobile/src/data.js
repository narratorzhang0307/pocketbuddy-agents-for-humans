export const WORLD_THEMES = {
  everyday: {
    id: 'everyday',
    name: '日常记忆镇',
    english: 'Everyday Memory Town',
    tagline: '一座由杯子、旧书与柔软回忆组成的小镇',
    paper: '#f4f1e8',
    line: '#252522',
    accent: '#d96d5f',
    accent2: '#8aa58c',
    accent3: '#8aa8bd',
    time: '08:42 · 微风',
    portal: '南站台',
    architecture: '生活街区',
    terrain: '纸张草地',
    places: ['咖啡店', '图书馆', '照相馆', '小住宅', '公园', '南站台'],
  },
  stardom: {
    id: 'stardom',
    name: '聚光星区',
    english: 'Stardom District',
    tagline: '注意力、表演与粉丝共同维持的明亮生态',
    paper: '#fbf1f2',
    line: '#271f21',
    accent: '#cf4355',
    accent2: '#d2a54b',
    accent3: '#e7a9b1',
    time: '20:10 · 演出前',
    portal: '红毯入口',
    architecture: '舞台街区',
    terrain: '淡粉广场',
    places: ['主舞台', '后台', '粉丝广场', '媒体区', '品牌包厢', '热搜塔'],
  },
  future: {
    id: 'future',
    name: '远昼殖民地',
    english: 'Future Colony',
    tagline: '工程蓝图、轨道与微小机器人构成的灰蓝前哨',
    paper: '#e9eef0',
    line: '#1e2b31',
    accent: '#318dba',
    accent2: '#6e9ba8',
    accent3: '#b4cbd1',
    time: '火星日 17 · 风暴',
    portal: '轨道站',
    architecture: '殖民舱组',
    terrain: '工程网格',
    places: ['轨道站', '实验室', 'AI 区', '能源塔', '殖民舱', '风暴观测站'],
  },
}

export const INITIAL_AGENTS = [
  { id: 'miko', name: 'Miko', type: 'mug', role: '咖啡店主人', home: '纸杯咖啡店', memory: 42, captured: '7 月 18 日', action: '正在检查热水', ability: '用杯壁保存温度与气味', privacy: '访客可见角色与公开记忆' },
  { id: 'nana', name: 'Nana', type: 'plush', role: '安慰者', home: '榆树公园', memory: 31, captured: '7 月 12 日', action: '陪一只小鸟发呆', ability: '察觉附近居民的紧张动作', privacy: '不公开原始照片' },
  { id: 'kiki', name: 'Kiki', type: 'camera', role: '记录者', home: '旧光照相馆', memory: 68, captured: '6 月 29 日', action: '去广场记录演出', ability: '将事件凝结为可携带照片', privacy: '访客可见经确认的照片' },
  { id: 'page', name: 'Page', type: 'book', role: '档案管理员', home: '折页图书馆', memory: 117, captured: '5 月 03 日', action: '整理一段新故事', ability: '在书页间建立记忆索引', privacy: '私人批注仅主世界可见' },
  { id: 'lumi', name: 'Lumi', type: 'lamp', role: '夜间引路者', home: '北巷住宅', memory: 26, captured: '4 月 21 日', action: '白天休息中', ability: '为夜路和情绪低落处照明', privacy: '不允许带出位置轨迹' },
  { id: 'echo', name: 'Echo', type: 'headphones', role: '音乐广播员', home: '榆树公园', memory: 54, captured: '3 月 09 日', action: '收集清晨的声音', ability: '把城市声音编成短广播', privacy: '只公开用户确认的声音' },
]

export const VISITOR = {
  id: 'iris',
  name: 'Iris',
  type: 'camera',
  role: '聚光星区记录官',
  origin: 'Stardom District',
  accent: '#cf4355',
  purpose: '寻找一段不以热度衡量的真实演出',
}

export const BRANCH_EVENTS = [
  { id: 'arrival', time: '09:04', title: 'Iris 从南站台到达', place: '南站台', people: 'Iris · Kiki', memory: '一张站台取景草图', relation: 'Kiki 对 Iris：好奇 +2', keep: false },
  { id: 'story', time: '09:17', title: 'Iris 与 Page 交换故事', place: '折页图书馆', people: 'Iris · Page', memory: '访问者留下的新故事', relation: 'Page 对 Iris：信任 +4', keep: false },
  { id: 'photo', time: '09:32', title: '生成纪念物「无观众的演出」', place: '榆树公园', people: 'Iris · Kiki · Nana', memory: '一张可公开的新照片', relation: '三人形成短期创作小组', keep: true },
]

export const CAPTURE_STEPS = [
  { id: 'capture', index: '01', title: '拍下物件', english: 'Capture Object' },
  { id: 'extract', index: '02', title: '保留它的轮廓', english: 'Extract Object' },
  { id: 'line', index: '03', title: '转换成线稿', english: 'Line-Art' },
  { id: 'rig', index: '04', title: '让它活起来', english: 'Bring It to Life' },
  { id: 'identity', index: '05', title: '确认它是谁', english: 'Agent Identity' },
  { id: 'motion', index: '06', title: '选择移动方式', english: 'Motion Preview' },
  { id: 'place', index: '07', title: '放进你的世界', english: 'Place in World' },
]

