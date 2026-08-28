import { useState } from 'react';
import type { PhotoSegmentation } from '../lib/photoHarness';

export default function PhotoHarnessMasks({ image, result }: { image: string; result: PhotoSegmentation }) {
  const [selected, setSelected] = useState('all');
  const [failed, setFailed] = useState(false);
  return <section className="space-y-2 border-2 border-black bg-white p-3 text-[12px]" aria-label="SAM 真实分割结果">
    <p className="font-bold">SAM 2.1 · 实际像素分割</p>
    <div className="relative overflow-hidden bg-black/5">
      <img src={image} alt="待核对的原始餐食" className="max-h-[300px] w-full object-contain" />
      {result.regions.filter(region => selected === 'all' || selected === region.region_id).map(region =>
        <img key={region.region_id} src={region.mask_uri} alt={`${region.category}的 SAM 像素掩膜`}
          onError={() => setFailed(true)} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />)}
    </div>
    {failed && <p role="alert">部分真实掩膜显示失败，请勿把当前叠图当成完整分割。</p>}
    <label>查看区域<select className="ml-2 max-w-full border border-black p-1" value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="all">全部通过区域</option>
      {result.regions.map(region => <option key={region.region_id} value={region.region_id}>{region.category}</option>)}
    </select></label>
    <p>预期 {result.expected_count} 个区域 · 通过 {result.regions.length} 个 · {result.status === 'needs_review' ? '数量不一致，需人工核对' : '数量一致，仍需核对菜名'}</p>
    <p>{result.regions.map(region => `${region.category}（分割评分 ${region.sam_score.toFixed(2)}）`).join('、') || '没有区域通过分割门槛，不能展示成功掩膜。'}</p>
    {!!result.rejected.length && <p>待复核：{result.rejected.map(row => row.item.category).join('、')}（未通过分割门槛）</p>}
    <p className="text-[10px] text-black/60">绿色覆盖来自 SAM 像素掩膜，不是检测框。评分不是识别准确率；SAM 不判断营养或重量。食物名称由 Qwen 定位，未额外调用裁剪图复核模型。耗时 {(result.elapsedMs / 1000).toFixed(1)} 秒。</p>
  </section>;
}
