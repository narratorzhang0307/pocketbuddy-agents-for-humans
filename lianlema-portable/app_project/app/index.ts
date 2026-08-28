import { registerRootComponent } from "expo";

import { installPreferredCamera } from "./src/camera/preferredCamera";
import App from "./App";

// web 上强制使用首选外接摄像头（影石 Insta360），须在渲染前安装。native 上自动跳过。
installPreferredCamera();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// It also ensures the environment is set up appropriately for Expo Go and native builds.
registerRootComponent(App);
