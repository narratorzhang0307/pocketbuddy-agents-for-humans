import { Text, View } from "react-native";

// Pocket Buddy embeds the web build (including on iOS). Keep the standalone Expo native build explicit.
export default function VideoAnalysisScreen() {
  return <View style={{ padding: 24 }}><Text>视频分析请在 Pocket Buddy 的练了吗页面或网页版中打开。</Text></View>;
}
