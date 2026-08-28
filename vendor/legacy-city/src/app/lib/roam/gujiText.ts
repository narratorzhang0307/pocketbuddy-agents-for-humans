const RESEARCH_BADGES =
  /【[^】]*(?:同址合并|待人工复核|待复核|私人预览)[^】]*】/g;

/**
 * 面向读者的古籍横排文本：保留正常中文标点，只移除制作流程与 OCR 统计噪声。
 * 原始 .skill 不在这里改写，导出与研究资料仍可追溯。
 */
export function formatGujiDisplayText(text: string | undefined): string {
  return (text ?? '')
    .replace(RESEARCH_BADGES, '')
    .replace(/本册在\d+种文献中检出[^；。]*[；。]?/g, '')
    .replace(/OCR\s*摘要\s*[：:]\s*/gi, '')
    .replace(/OCR\s*共\s*\d+\s*次/gi, '')
    .replace(/[^。！？；\n]*OCR[^。！？；\n]*[。！？；]?/gi, '')
    .replace(/SOURCE\s+INDEX/gi, '')
    .replace(/\d{4}年(?:汇编|影印|出版)[^。！？；\n]*[。！？；]?/g, '')
    .replace(/(?:待审核预览|待审核私人预览|待审核的私人预览)/g, '')
    .replace(/共关联\d+条(?:目录|正文|目录\s*\/\s*正文)见证[。；;]?/g, '')
    .replace(/保留全部来源书证[。；;]?/g, '')
    .replace(/\bWGS\s*84\b[，,；;]?/gi, '')
    .replace(/花点代表[^。！？]*[。！？]?/g, '')
    .replace(/(?:运行资产|私人预览)(?:数据)?/g, '')
    .replace(/[○◯]/g, '□')
    .replace(/[\[\]]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/^[\s，,；;：:]+|[\s，,；;：:]+$/g, '')
    .replace(/([。！？])\1+/g, '$1')
    .trim();
}
