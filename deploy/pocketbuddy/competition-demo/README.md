# 烈变参赛 Web Demo 部署

目标域名是 `pocket-buddy.throughtheglass.art`（有短横线）。原来的 `pocketbuddy.throughtheglass.art`、旧仓库和 iOS 默认 API 地址保持不变。

## 隔离边界

| 项目 | 新 Demo |
| --- | --- |
| 源码 | `narratorzhang0307/Pocket-Buddy` 的 `main` |
| 发布目录 | `/root/pocket-buddy-demo/releases/<release-id>` |
| 当前版本 | `/root/pocket-buddy-demo/current` 符号链接 |
| 私有配置与独立数据 | `/root/pocket-buddy-demo/shared`，不在静态目录、不入 Git |
| Web / Node API | `127.0.0.1:3045`，独立 `pocket-buddy-demo.service` |
| HTTPS | 只覆盖新域名的证书与 Nginx 配置 |
| 运动和照片推理 | 复用本机已有的 `4020` / `4030` 模型服务；不复制或重启模型服务，不迁移旧站用户数据 |

## 从源码构建

安装根项目、`lianlema-portable/app_project/app`、`vendor/her-motion` 的锁定依赖后执行：

```sh
node deploy/pocketbuddy/competition-demo/build.mjs /绝对路径/全新输出目录 /绝对路径/私有配置目录
```

私有配置目录的 `.env` / `.env.local` 只用于读取部署需要的高德浏览器 Key、安全码及可选 Mapbox 公钥。不要将这些文件提交到仓库。脚本分别重建练了吗、Her Motion 和主应用，不读取旧 `dist-ios`，不打包或安装 iOS。

浏览器只包含可公开的地图 Key 和同域代理地址；高德安全码被生成到输出根目录的 `amap-proxy.conf`（0600），不进入 `release/dist`。[高德官方安全代理说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)。

构建后对实际 `release/dist` 运行识鸟、技能画布和 Frost Skills 校验；运行类型检查与测试，并扫描产物，确认没有服务端密钥。`release/dist/release.json` 记录本次源码和练了吗源码指纹，不手改哈希来绕过检查。

## 首次上线顺序

1. 核对服务器和空闲端口；先记录旧站配置摘要与当前发布路径。新目录、新服务、新配置若已存在，停止并检查，不能直接覆盖。
2. 在新目录准备独立私有配置（`API_HOST=127.0.0.1`、`API_PORT=3045`、`TRUST_PROXY=true`、本机健康桥接关闭）。模型密钥仅在服务器内按白名单配置，保留原站配置。
3. 上传本次 `release` 到唯一发布目录，使用其 `server/package.json` 安装 Linux 运行依赖。`.agent-forge-data` 只链接到新站的独立 shared 目录。
4. 先安装 `bootstrap.conf`，`nginx -t` 通过才 reload；使用已有 ACME 账户和专用 webroot 申请新域名证书，不替换旧证书。续期只 reload Nginx。
5. 将私有地图代理配置安装到 `shared/amap-proxy.conf`；安装独立 systemd 服务，检查回环接口，再将新站配置替换为本目录的 `nginx.conf`。语法验证通过才 reload。
6. 从外网验证证书、HTTP 跳转、首页与资源、地图代理、运动/照片依赖健康及同意/来源限制；再用浏览器检查实际界面和子应用。

只重启 `pocket-buddy-demo.service`，不执行全局 PM2 重启。后续发布需保存前一个 `current` 目标并原子切换；失败时回退新站自己的目标，不动旧站。

## 演示边界

这是浏览器体验，不代表 iOS 安装或实体徽章验收。摄像头需要用户授权；蓝牙、原生相册和端侧模型能力以对应设备及配置为准。自定义技能画布的预览不冒充实际执行。用户明确确认前不上传私人照片或开启摄像头；训练视频帧不落盘，模型接口保留限流与同意校验。
