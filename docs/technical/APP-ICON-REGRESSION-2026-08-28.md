# 小狗图标回退修复

2026082822 全量发布时发现品牌图标回退成旧地球图。原因是正式工程的
`public/icons/` 未包含已确认的小狗图片，而原有检查只比较 public 与原生图片是否相同，
无法发现“两边同时是旧图”的情况。

## 本次修复

- 将用户确认的 Frost 单眼眨眼图标的 11 个尺寸恢复到正式工程 `public/icons/`，
  原生 AppIcon 使用同一张 1024px 图片。不更换角色、不重绘图片。
- 素材来源仅为已核验的 2026082810 发布包中的图标；没有复制旧源码、旧 JS、
  旧原生可执行文件或旧安装包来构建修正版。
- `scripts/ios/verify-app-icon.mjs` 固定已确认图片的 SHA256，检查 prepare、
  Xcode 源码检查、归档和安装流程中的图标。归档/IPA 还校验真正编译出的 iPhone/iPad 图标。
- 已确认 2026082810 通过检查，错误的 2026082822 被拒绝。
- iOS 工具链若改变 PNG 编码，须重新视觉核对并有意识地更新基线，不可跳过检查。

## 保留能力

桌面伙伴、18 个组件头像、ActivityKit 灵动岛/锁屏卡片、BLE 连接、
小狗入场动画、最新版线稿画布、可移除/恢复的 Photos 示例及医院 Qwen 入口均保留。
图标是一张单眼眨眼的静态品牌图，不能把它描述为系统主屏幕图标的持续动画。
实际手机和硬件交互仍需真机验收。

## 验证

```sh
npm run ios:test
node scripts/ios/verify-app-icon.mjs
node scripts/ios/verify-app-icon.mjs --app /path/to/App.app
node scripts/ios/archive.mjs --build-number <已核对未使用的构建号>
```

GitHub 仅保存当前源码、测试和必要素材；不提交旧快照、生成的子应用包、
签名文件、安装包、模型权重或用户数据。练了吗源码直接引用的离线教练音频作为必要素材保留。
