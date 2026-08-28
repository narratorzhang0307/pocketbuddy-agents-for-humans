# 城市地图兼容源码

本目录于 2026-08-27 从 SSD 上已有的历史源码中按相对 import 闭包复制，用于修复谷歌项目两处指向已不存在桌面目录的依赖。

来源：`/Volumes/Extreme SSD/桌面旧文件归档_2026-08-23/小有可为/生声不息`

入口：`src/app/components/MyMapTab.tsx` 和 `src/app/lib/maps/runtime.ts`。

共复制 343 个源码、样式和静态资源文件，约 5.8 MB；包含其引用的 12 个 `frost-agent` 文件。没有复制整份旧项目、node_modules、训练数据或构建产物。不替换原城市花草地图的业务逻辑；唯一的兼容调整是把数据包默认地址改为主项目已有的本地 books/movies/music bundle，仍支持原环境变量覆盖。

主项目的 `EarthActionMapTab` 与 `RunRouteOverlay` 使用本目录；运行依赖在主项目 `package.json` 中声明。Tailwind 扫描范围已包含此目录。原有 3D 环境类型声明沿用主项目 `src/types/vendor-3d.d.ts`。
