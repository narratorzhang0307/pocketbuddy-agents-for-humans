// 漫游手帐 · 数据模型：一页手帐 = 一个自由摆放的「元素数组」。
// 坐标全归一（0..1，相对页宽/页高），画布可响应式缩放、导出时乘目标分辨率——移动端/桌面/导出一致。
// 图类元素（碎片/照片/票根/明信片）的图 blob 存 IndexedDB，元素只存 blobId 指针（照 cutouts/zine 范式）。

export type JournalElementType =
  | 'cutout'    // 套索碎片贴纸（dieCut 产物）
  | 'photo'     // 拍立得相框（含 frame 样式）
  | 'ticket'    // 照片票根 / 登机牌（drawTicketStub / drawBoardingPass 产物）
  | 'postcard'  // 古籍明信片
  | 'tape'      // 和纸胶带（纯样式）
  | 'clip'      // 回形针（纯 SVG）
  | 'note'      // 方格便签（可编辑文字）
  | 'bubble'    // 气泡文字注记（可编辑，AnyPiece 引言气泡）
  | 'arrow'     // 手绘连接箭头
  | 'kraft'     // 牛皮纸底块
  | 'sticker';  // 色条标签 / 朱戳等小贴

export interface JournalElement {
  id: string;
  type: JournalElementType;
  x: number;                        // 中心 X（归一 0..1，相对页宽）
  y: number;                        // 中心 Y（归一 0..1，相对页高）
  w: number;                        // 宽（归一，相对页宽）；高由内容/图片长宽比推得
  rot: number;                      // 旋转角（度，可任意；拼贴不钳）
  scale: number;                    // 缩放（0.1..8）
  z: number;                        // 层级
  blobId?: string;                  // 图 blob 指针（图类元素）
  text?: string;                    // note / bubble 文案
  color?: string;                   // tape / sticker / note / bubble 主题色
  frame?: 'white' | 'black' | 'film'; // photo 相框形态
  tone?: number;                    // photo 滤镜档（对应 JournalMaterials.TONE 下标）
  meta?: Record<string, unknown>;   // arrow 两端 / ticket 地名日期 / 其它
}

export type JournalBg = 'kraft' | 'paper' | 'grid';

export interface JournalPage {
  id: string;
  city?: string;                    // 归属城市（补齐 cutout 缺的 city 维度）
  title?: string;
  bg: JournalBg;                    // 纸质底
  elements: JournalElement[];
  createdAt: number;                // 毫秒时间戳
  updatedAt: number;
}

/** 导出/导入的可迁移封包（碎片图以 base64 dataURL 内联，跨设备搬运）。 */
export interface JournalBundle {
  v: 1;
  page: JournalPage;
  blobs: Record<string, string>;    // blobId → dataURL
}
