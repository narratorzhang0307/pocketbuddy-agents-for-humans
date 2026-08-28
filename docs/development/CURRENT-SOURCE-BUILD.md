# 从当前源码完整构建

此仓库保存源码与必要素材，不保存旧发布快照或 `dist-ios`。
主应用与两个子应用有各自的依赖锁文件，不能只安装根目录依赖：

```sh
# Node.js 22+；各目录严格使用自己的 package-lock.json。
npm ci
npm --prefix lianlema-portable/app_project/app ci
npm --prefix vendor/her-motion ci

npm run typecheck
npm test
npm run ios:test

# Web：先完整构建两个子应用，再构建主应用。
node deploy/pocketbuddy/build-coach-web.mjs
node node_modules/vite/bin/vite.js build --config vendor/her-motion/vite.config.ts
npm run build

# iOS：自动重建子应用、主应用并同步原生工程。
npm run ios:prepare
# macOS + Xcode + 有效开发者签名；先在 Apple 后台确认构建号未被占用。
node scripts/ios/archive.mjs --build-number <未使用的构建号>
```

Her Motion 使用自己的 Tailwind/PostCSS 版本；遗漏其 `npm ci` 会错误解析到
主应用的另一个 Tailwind 主版本。不要因此升级或混用依赖。

`public/lianlema`、`public/her-motion`、`dist`、`dist-ios`、iOS public 是生成目录。
签名资料、密钥、私有照片、验收截图和日志、模型训练权重不提交。
练了吗源码直接引用的离线教练音频是构建必需素材，已纳入该子应用的 `assets/audio/`。
SAM/训练推理服务及对应权重仍需按模块说明部署；它们不是 GitHub 上传即自动开通的服务。

源码已明确退役的旧技能画布、旧鸟图清单不应重新拷贝进来。图标固定为已确认的小狗单眼眨眼图；
所有 iOS 发布必须通过来源、画布、Frost Skills、识鸟和图标检查。
