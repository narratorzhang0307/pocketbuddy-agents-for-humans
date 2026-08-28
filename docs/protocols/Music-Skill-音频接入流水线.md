# Music Skill 音频接入流水线

## 当前仓库的真实状态

Music Skill 运行时只消费 `pocket.music/v1` 的播放引用：

- `provider: "youtube"` 使用 YouTube 官方 iframe；
- `provider: "oss"` / `"external"` 使用 HTML Audio 直链；
- 示例音乐包目前包含 1,271 个 OSS 播放引用。

仓库原有 `frost-agent/agents/music-pipeline/pipeline.mjs` 只实现了最后的
`writeback`。它没有实现 YouTube 解析、下载、FFmpeg 转码或 OSS 上传。已发布
OSS 音频的上游制作过程不在当前仓库内，因此不能把原有脚本描述成完整自动流水线。

## 两条受支持的路径

### A. YouTube 官方引用

```text
YouTube HTTPS URL
→ 校验并提取 11 位 video ID
→ 生成 provider=youtube 的播放引用
→ Data Pack / Music Skill
→ YouTube 官方 iframe 播放
```

```bash
python3 scripts/music/ingest-authorized-audio.py reference \
  --youtube-url 'https://www.youtube.com/watch?v=M7lc1UVf-VE'
```

这条路径不下载、不拆音轨、不缓存媒体。客户端仍需能够访问 YouTube；服务端不能把
官方播放器变成不受地区限制的 OSS 音频。

### B. 本地音频发布到 OSS

```text
本地音频
→ 服务端 FFprobe 时长门禁
→ FFmpeg AAC-LC / M4A / faststart
→ SHA256 不可变对象 Key
→ OSS 上传与 byte-size 复验
→ provider=oss 的 pocket.music/v1 播放引用
→ 手机 HTML Audio 直连播放
```

先做不上传的端到端干跑：

```bash
python3 scripts/music/ingest-authorized-audio.py publish \
  --input /absolute/path/to/owned-song.wav \
  --title 'My Song' \
  --artist 'Me' \
  --rights-confirmed \
  --dry-run
```

真实发布：

```bash
python3 scripts/music/ingest-authorized-audio.py publish \
  --input /absolute/path/to/owned-song.wav \
  --title 'My Song' \
  --artist 'Me' \
  --source-url 'https://www.youtube.com/watch?v=YOUR_OWN_VIDEO_ID' \
  --rights-confirmed
```

凭据优先读取服务器环境变量：

- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `OSS_SECURITY_TOKEN`（STS 时使用）

没有环境变量时读取阿里云 CLI profile，默认名为 `pocketearth-pai`。服务端需要
`ffmpeg` 与 Python `oss2`；若安装了 `ffprobe` 会优先用于时长检测，否则回退到
`ffmpeg`。脚本拒绝远程媒体 URL 作为输入；可选 `source-url` 只记录来源，不会被下载。

### C. YouTube → OSS 技术验证

```text
YouTube URL
→ 服务端 yt-dlp 拉取单个视频的最佳音频
→ FFmpeg 统一为 AAC-LC / M4A
→ OSS 上传与 byte-size 复验
→ 通过 assets-pocketearth.throughtheglass.art 返回支持 Range 的内联音频 URL
→ Qwen 3.7 Max 生成歌曲简介、歌手说明和建议落点
→ 用户确认后写入 userMarks 音乐图层
→ 自动切换中间地球 Tab，并展开可播放的音乐详情卡
```

先验证下载与转码，不写 OSS：

```bash
npm run music:ingest -- youtube-publish \
  --youtube-url 'https://www.youtube.com/watch?v=jNQXAC9IVRw' \
  --title 'YouTube Pipeline Test' \
  --dry-run
```

去掉 `--dry-run` 即真实上传。手机 VPN 只影响手机；服务端不能访问 YouTube 时，给
命令增加服务端代理参数，例如 `--proxy socks5://127.0.0.1:1080`。

App 与 Android 使用同一份接口契约：`POST /api/music/youtube-publish`，请求体为
`{"youtubeUrl":"https://www.youtube.com/watch?v=..."}`。生产服务器需要安装
`yt-dlp`、`ffmpeg`、Python `oss2`，并配置 OSS 与 DashScope 凭据。音乐卡模型默认
为 `qwen3.7-max`，可用 `QWEN_MUSIC_CARD_MODEL` 覆盖；媒体公开域可用
`MUSIC_PUBLIC_BASE` 覆盖。
