import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchVerifiedMappingDemoPdf, MAPPING_DEMO_PDF } from '../lib/mapping/demoAsset';

GlobalWorkerOptions.workerSrc = pdfWorker;

export default function MappingPdfPreview({ onClose, onLoadExample }: { onClose: () => void; onLoadExample: () => void }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState('正在从 OSS 下载 PDF…');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        if (!disposed) setStatus('PDF 已下载 · 正在校验 SHA-256…');
        const bytes = await fetchVerifiedMappingDemoPdf();
        if (!disposed) setStatus(`完整性已通过 · 正在解析 ${MAPPING_DEMO_PDF.pages} 页 PDF…`);
        loaded = await getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        if (disposed) { await loaded.destroy(); return; }
        if (loaded.numPages !== MAPPING_DEMO_PDF.pages) throw new Error(`PDF 页数异常：${loaded.numPages}`);
        setSourceBytes(bytes);
        setDocument(loaded);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { disposed = true; if (loaded) void loaded.destroy(); };
  }, []);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let renderTask: RenderTask | null = null;
    let disposed = false;
    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (disposed || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 1.08 });
        const capture4k = new URLSearchParams(window.location.search).has('capture4k');
        const ratio = capture4k ? 4 : Math.min(2, window.devicePixelRatio || 1);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('无法创建 PDF 预览画布');
        canvas.width = Math.max(1, Math.round(viewport.width * ratio));
        canvas.height = Math.max(1, Math.round(viewport.height * ratio));
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
        renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
        await renderTask.promise;
      } catch (reason) {
        if (!disposed && !String(reason).toLowerCase().includes('cancel')) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { disposed = true; renderTask?.cancel(); };
  }, [document, pageNumber]);

  const downloadPdf = () => {
    if (!sourceBytes) return;
    const url = URL.createObjectURL(new Blob([sourceBytes], { type: 'application/pdf' }));
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = MAPPING_DEMO_PDF.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="fixed inset-0 z-[120] flex flex-col bg-[#eaeaea]" role="dialog" aria-modal="true" aria-label="金陵世纪 Mapping 测试 PDF 预览">
    <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-black bg-white px-3 py-2.5">
      <button type="button" onClick={onClose} aria-label="关闭 PDF 预览" className="grid h-9 w-9 place-items-center border-2 border-black"><X className="h-5 w-5" /></button>
      <FileText className="h-5 w-5 text-[#008b51]" />
      <div className="min-w-0 flex-1"><b className="block truncate font-pixel text-[9px]">{MAPPING_DEMO_PDF.title}</b><p className="mt-1 text-[7px] text-black/45">测试输入 · 阿里云 OSS · App 内渲染</p></div>
      {document && <span className="flex items-center gap-1 text-[7px] text-[#238c57]"><Check className="h-3 w-3" />已校验</span>}
    </header>

    <main className="min-h-0 flex-1 overflow-auto bg-[#242424] p-2">
      {!document && !error && <div className="grid h-full place-items-center text-white"><div className="text-center"><LoaderCircle className="mx-auto h-7 w-7 animate-spin" /><p className="mt-2 text-[9px]">{status}</p></div></div>}
      {error && <div className="m-3 border-2 border-[#b3261e] bg-[#fff0ed] p-3 text-[9px] leading-relaxed text-[#b3261e]">{error}</div>}
      {document && !error && <canvas ref={canvasRef} aria-label={`PDF 第 ${pageNumber} 页`} className="mx-auto block max-w-full bg-white shadow-[3px_3px_0_#000]" />}
    </main>

    <footer className="shrink-0 space-y-2 border-t-[3px] border-black bg-white p-3">
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <button type="button" aria-label="上一页" disabled={!document || pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))} className="grid h-9 place-items-center border-2 border-black disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center font-pixel text-[8px]">{document ? `${pageNumber} / ${document.numPages}` : '— / —'}</div>
        <button type="button" aria-label="下一页" disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber((value) => Math.min(document?.numPages || value, value + 1))} className="grid h-9 place-items-center border-2 border-black disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!sourceBytes} onClick={downloadPdf} className="flex h-10 items-center justify-center gap-1 border-2 border-black bg-white text-[8px] font-bold disabled:opacity-35"><Download className="h-4 w-4" />下载这 10 页</button>
        <button type="button" disabled={!document} onClick={onLoadExample} className="flex h-10 items-center justify-center gap-1 border-2 border-black bg-[#00ef86] text-[8px] font-bold disabled:opacity-35"><Upload className="h-4 w-4" />载入测试 PDF</button>
      </div>
    </footer>
  </div>;
}
