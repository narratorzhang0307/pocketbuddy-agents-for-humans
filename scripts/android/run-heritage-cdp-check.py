#!/usr/bin/env python3
import json
import sys
import urllib.request

import websocket


def evaluate(ws, expression):
    ws.send(json.dumps({
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
        },
    }))
    while True:
        message = json.loads(ws.recv())
        if message.get("id") != 1:
            continue
        if "exceptionDetails" in message.get("result", {}):
            raise RuntimeError(json.dumps(message["result"], ensure_ascii=False))
        return message["result"]["result"].get("value")


pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json"))
page = next(item for item in pages if item.get("type") == "page")
adapter = "rubbing-vision" if "--rubbing-lora" in sys.argv else "guji-vision" if "--lora" in sys.argv else ""
pair = "--pair" in sys.argv
click_text = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--click=")), "")
click_index = next((int(arg.split("=", 1)[1]) for arg in sys.argv if arg.startswith("--click-index=")), -1)
click_card = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--click-card=")), "")
scroll_text = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--scroll=")), "")
crop_arg = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--crop=")), "")
crop_box = [int(value) for value in crop_arg.split(",")] if crop_arg else []
hint = "--hint" in sys.argv
max_tokens = next(
    (int(arg.split("=", 1)[1]) for arg in sys.argv if arg.startswith("--tokens=")),
    128,
)
if "--buttons" in sys.argv:
    expression = "[...document.querySelectorAll('button')].map((button, index) => ({ index, text: (button.innerText || '').trim(), disabled: button.disabled }))"
elif "--travel-ui" in sys.argv:
    expression = """
(() => {
  const setValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll('input')];
  const destination = inputs.find((item) => item.type === 'text');
  const date = inputs.find((item) => item.type === 'date');
  const request = inputs.find((item) => (item.placeholder || '').includes('补充要求'));
  if (!destination || !date || !request) {
    return { started: false, inputs: inputs.map((item) => ({ type: item.type, placeholder: item.placeholder })) };
  }
  setValue(destination, '京都');
  setValue(date, '2026-08-15');
  setValue(request, '慢节奏，少走回头路，每天最多3个地点。');
  for (const label of ['2天', '美食', '历史', '小众']) {
    const button = [...document.querySelectorAll('button')]
      .find((item) => (item.innerText || '').trim() === label);
    button?.click();
  }
  const run = [...document.querySelectorAll('button')]
    .find((item) => (item.innerText || '').trim() === '规划');
  run?.click();
  return { started: Boolean(run), destination: destination.value, date: date.value, request: request.value };
})()
"""
elif "--validate-punctuation" in sys.argv:
    expression = """
(() => {
  const source = [...document.querySelectorAll('textarea')]
    .map((item) => item.value || '')
    .sort((left, right) => right.length - left.length)[0] || '';
  const body = document.body.innerText || '';
  const start = body.lastIndexOf('【断句稿】');
  const explanationLabels = ['【白话释义】', '【馆藏题名辅助释义】'];
  const end = explanationLabels
    .map((label) => body.indexOf(label, start))
    .filter((index) => index > start)
    .sort((left, right) => left - right)[0] ?? -1;
  const punctuated = start >= 0 && end > start
    ? body.slice(start + '【断句稿】'.length, end).trim()
    : '';
  const strip = (value) => value.replace(/[，。；：？！、,.!?;:\\s]/g, '');
  return {
    sameSourceCharacters: Boolean(source && punctuated) && strip(source) === strip(punctuated),
    source,
    punctuated,
    sourceCharacters: [...strip(source)].length,
    punctuatedCharacters: [...strip(punctuated)].length,
  };
})()
"""
elif "--dom" in sys.argv:
    expression = "document.body.innerText"
elif scroll_text:
    expression = f"""
(() => {{
  const label = {json.dumps(scroll_text)};
  const target = [...document.querySelectorAll('h1,h2,h3,h4,div,section')]
    .filter((element) => (element.innerText || '').includes(label))
    .sort((left, right) => (left.innerText || '').length - (right.innerText || '').length)[0];
  if (!target) return {{scrolled: false, label}};
  target.scrollIntoView({{block: 'start'}});
  return {{scrolled: true, label}};
}})()
"""
elif click_card:
    expression = f"""
(() => {{
  const label = {json.dumps(click_card)};
  const title = [...document.querySelectorAll('div,article,section')]
    .find((element) => (element.innerText || '').split('\\n')[0].includes(label));
  const card = title?.closest('article,section') || title;
  const target = card && [...card.querySelectorAll('button')]
    .find((button) => /运行 Base|打开 Skill|运行/.test(button.innerText || ''));
  if (!target) return {{clicked: false, label}};
  target.click();
  return {{clicked: true, label, text: target.innerText}};
}})()
"""
elif click_index >= 0:
    expression = f"""
(() => {{
  const target = [...document.querySelectorAll('button')][{click_index}];
  if (!target) return {{clicked: false, index: {click_index}}};
  target.click();
  return {{clicked: true, index: {click_index}, text: target.innerText || ''}};
}})()
"""
elif click_text:
    expression = f"""
(() => {{
  const label = {json.dumps(click_text)};
  const target = [...document.querySelectorAll('button')]
    .find((button) => (button.innerText || '').includes(label));
  if (!target) return {{clicked: false, label, body: document.body.innerText.slice(0, 4000)}};
  target.click();
  return {{clicked: true, label, text: target.innerText}};
}})()
"""
elif "--install-rubbing" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'asset_install',
  asset: 'rubbing-vision-lora',
  url: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models/rubbing-vision-lora/pocketearth-int8-20260810/visual-lora.mnn',
  sha256: '1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e',
  bytes: 17588592
}}))()
"""
elif "--install-travel" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'asset_install',
  asset: 'travel-planner-lora',
  url: 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models/travel-planner-lora/travel-planner-v1/lora.mnn',
  sha256: '791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13',
  bytes: 72633256
}}))()
"""
elif "--status" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'runtime_status'
}}))()
"""
elif "--travel-lora" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  system: '你是“上街去”的离线旅行请求解析器。你只负责把用户需求转换成 shangjiequ.travel-intent/v1 JSON，并决定追问或调用本地工具；不背诵城市事实，不直接编造行程。硬约束必须原样保留。未知字段使用 null 或空数组，不得猜测。如果缺少目的地，或日期与天数都缺少，只追问一个最关键的问题并把 next_action 设为 ask_user；否则设为 call_tools。只输出一个 JSON 对象，不要 Markdown，不要解释。',
  prompt: '帮我安排京都2日游。\\n出行日期：2026-08-15。\\n偏好美食、历史、小众。\\n用户补充原话：慢节奏，少走回头路，每天最多3个地点。\\n目的地、日期和天数以界面填写为准，均已齐全；请解析完整约束并调用本地工具。',
  json: true,
  adapter: 'travel-planner',
  maxTokens: 384
}}))()
"""
elif "--travel-base" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  system: '你是旅行需求抽取器。只允许输出一行固定模板：目的地=；天数=；兴趣=；节奏=；绕路限制=；每日站数=。只抄用户已给出的值，未提及写“无”。禁止出现模板外的任何文字，禁止补充景点、酒店、预算或行程。',
  prompt: '帮我安排京都2日游。出行日期：2026-08-15。偏好美食、历史、小众。慢节奏，少走回头路，每天最多3个地点。',
  maxTokens: 64
}}))()
"""
elif "--text" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  prompt: '只回复：西湖净慈寺',
  maxTokens: 32
}}))()
"""
elif "--interpret" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  system: '你是古籍整理助手。原文证据优先；断句可以生成，原字不得篡改；释义必须与给定原文逐句对应。',
  prompt: '以下内容是用户确认过的古籍 OCR 稿。只能依据这份文字工作，严禁补写原文中不存在的人名、地名、年代或情节。\\n\\n原文：\\n始以十三級為準擬高千尺後財力不敷止建七級\\n\\n请严格输出三个部分：\\n【断句稿】保留所有原字，只添加现代标点，不改字、不删字。\\n【白话释义】按断句逐句解释。\\n【疑难提示】没有则写“无”。',
  maxTokens: 320
}}))()
"""
elif "--punct-chunk" in sys.argv:
    expression = """
(async () => {
  const source = [...document.querySelectorAll('textarea')]
    .map((item) => item.value || '').find((value) => value.includes('始以十三')) || '';
  const lines = source.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
  let chunk = '';
  for (const line of lines) {
    if (chunk && [...chunk.replace(/\\n/g, '')].length + [...line].length > 68) break;
    chunk += `${chunk ? '\\n' : ''}${line}`;
  }
  return await window.Capacitor.Plugins.PocketMnn.run({request: {
    task: 'chat',
    system: '你是古籍整理助手。原文证据优先；断句可以生成，原字不得篡改；释义必须与给定原文逐句对应。',
    prompt: `以下内容是用户确认过的古籍 OCR 稿。换行来自竖排分栏，行尾不一定是句末。\n\n原文：\n${chunk}\n\n请严格输出三个部分：\n【断句稿】保留所有原字，只添加现代中文标点，不改字、不删字。\n【白话释义】按断句简要解释。\n【疑难提示】没有则写“无”。`,
    maxTokens: 320
  }});
})()
"""
elif "--rubbing-punct" in sys.argv:
    expression = """
(async () => {
  const source = [...document.querySelectorAll('textarea')]
    .map((item) => item.value || '').sort((left, right) => right.length - left.length)[0] || '';
  return await window.Capacitor.Plugins.PocketMnn.run({request: {
    task: 'chat',
    system: '你只负责给碑刻原文添加标点。禁止解释，禁止评论，禁止改字。',
    prompt: `碑拓原文：\n${source}\n\n只输出加标点后的原文。保留每一个原字和换行，不得输出标题、解释或括号说明；每行末尾至少添加一个句号。`,
    maxTokens: 96
  }});
})()
"""
elif "--rubbing-explain" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  system: `你只做碑额残文的字面释读。信息不足就明确说不足；禁止补写人物身份、生平、年代、官职经历或历史故事。`,
  prompt: `碑拓确认稿仅有以下残文：\n晋故振威折\n覃爵朴大守\n内庚河内\n遗府君墓道。\n\n只输出：【白话释义】一句话说明可直接看出的信息；【疑难提示】列出无法确认的字。不得猜测“某位官吏”的生平，不得扩写原文没有的事实。`,
  maxTokens: 128
}}))()
"""
elif "--rubbing-reference-explain" in sys.argv:
    expression = """
(async () => await window.Capacitor.Plugins.PocketMnn.run({request: {
  task: 'chat',
  system: `你只根据明确给出的碑拓确认稿和馆藏题名做字面释读。禁止补写人物生平、年代、家世、政绩或死亡原因。`,
  prompt: `碑拓确认稿：\n晋故振威折\n覃爵朴大守\n内庚河内\n遗府君墓道。\n\n馆藏题名（辅助证据，不是 OCR 输出）：\n晉故振威將軍鬱林太守趙府君墓道額墨拓本。\n\n只输出两个部分：\n【白话释义】用两句话说明馆藏题名直接表明的信息，以及 OCR 残文需要核对。\n【疑难提示】只列出确认稿与馆藏题名不一致的疑字。不得介绍原文未给出的人物经历。`,
  maxTokens: 128
}}))()
"""
elif "--native-ocr" in sys.argv:
    expression = """
(async () => {
  const response = await fetch('/assets/heritage-demo/xihu-mengxun-leifeng-page-source.jpg');
  const blob = await response.blob();
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return await window.Capacitor.Plugins.PocketMnn.run({request: {
    task: 'ocr_chinese', image
  }});
})()
"""
else:
    expression = f"""
(async () => {{
  const response = await fetch('/assets/heritage-demo/xihu-mengxun-leifeng-page-source.jpg');
  const blob = await response.blob();
  const image = await new Promise((resolve, reject) => {{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }});
  const request = {{
    task: 'vision',
    image,
    prompt: '这是一页繁体竖排古籍扫描。请从右向左、每列从上到下逐字识读图中实际可见的文字。只输出识读到的原文，不要补写、不要解释，无法确认的字用□。',
    adapter: {json.dumps(adapter)},
    detail: 'ocr',
    maxTokens: {max_tokens}
  }};
  if ({str(pair).lower()}) {{
    const source = await new Promise((resolve, reject) => {{
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = image;
    }});
    const crop = (x, width) => {{
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = source.naturalHeight;
      canvas.getContext('2d').drawImage(
        source, x, 0, width, source.naturalHeight,
        0, 0, width, source.naturalHeight
      );
      return canvas.toDataURL('image/jpeg', 0.94);
    }};
    const middle = Math.floor(source.naturalWidth / 2);
    request.images = [
      crop(middle, source.naturalWidth - middle),
      crop(0, middle)
    ];
    delete request.image;
    request.prompt = '图一是古籍页面右半页，图二是同页左半页。繁体竖排，先逐字转录图一，再逐字转录图二；每图均从右列到左列、每列从上到下。只输出可见原文，不补写，不解释，无法确认写□。';
  }}
  if ({json.dumps(crop_box)}.length === 4) {{
    const source = await new Promise((resolve, reject) => {{
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = image;
    }});
    const [x, y, width, height] = {json.dumps(crop_box)};
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
    request.image = canvas.toDataURL('image/jpeg', 0.96);
    delete request.images;
    request.prompt = {json.dumps('图中只有繁体竖排古籍的一栏正文。专业 OCR 候选是：“始以十级為準擬高千尺後財力不敷止建七級”。请逐字对照图片校正候选；不得添加图片中没有的句子，不得解释，无法确认的字写□。只输出校正后的一栏。' if hint else '图中只有繁体竖排古籍的一栏正文。请从上到下逐字抄录实际可见汉字。禁止根据意思续写，禁止解释，无法确认的字写□。只输出这一栏原文。')};
  }}
  return await window.Capacitor.Plugins.PocketMnn.run({{request: {{
    ...request
  }}}});
}})()
"""

ws = websocket.create_connection(
    page["webSocketDebuggerUrl"], timeout=180, suppress_origin=True
)
try:
    value = evaluate(ws, expression)
    print(json.dumps(value, ensure_ascii=False, indent=2))
finally:
    ws.close()
