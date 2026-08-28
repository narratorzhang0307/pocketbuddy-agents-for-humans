# OJBadge 中文按键提示字形

`../ojbadge_zh_22.c` 包含GB2312全部6763个汉字、ASCII英文/数字、GB2312符号和补充标点，以及识鸟用“鹟”，共7546个字形，22px、2bpp、无压缩。逐字核对源字体与生成结果，无缺失字形；不是全部Unicode/Emoji字库。精确字符集合见 `gb2312_symbols.txt`。两个提示句分别宽132px和154px，适配240px圆屏。

原字体：[Noto Sans SC Regular](https://github.com/notofonts/noto-cjk/blob/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf)，版本2.004，Copyright © 2014–2021 Adobe，SIL Open Font License 1.1，见同目录许可证。源OTF的SHA256：`faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9`。源字体与转换工具保存在开发机私有工具目录，不把8MiB字体或Node依赖加入固件工程。

使用[LVGL官方转换器](https://github.com/lvgl/lv_font_conv) `lv_font_conv@1.5.3`。在源字体和字符集合文件所在目录复现（转换器需在PATH中）：

```python
from pathlib import Path
import subprocess

symbols = Path('gb2312_symbols.txt').read_text().rstrip('\n')
subprocess.run([
    'lv_font_conv', '--font', 'NotoSansSC-Regular.otf', '--symbols', symbols,
    '--size', '22', '--bpp', '2', '--no-compress', '--no-kerning',
    '--format', 'lvgl', '--lv-include', 'lvgl.h',
    '--lv-font-name', 'ojbadge_zh_22', '--output', 'ojbadge_zh_22.c',
], check=True)
```

生成后保留版权及许可说明，避免把完整字符集合打印到生成文件头。固件启动会检查录音、识鸟提示及十二种鸟名所需的字形是否可查询，按住反馈界面仍须真机确认。目前此字体用于按键反馈，其他既有英文标签保持原字号与布局；未来动态中文文本应明确使用此字体并检查超出字符集合的内容，不能靠换字体名称保证永不缺字。

当前“正在倾听说话”属于用户要求的按键识别提示，另有“仅测试，未录音”明确标注，不能作为真实录音或ASR成功的证据。
