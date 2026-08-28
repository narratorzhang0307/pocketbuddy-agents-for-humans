import type { ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
  type RouteProp,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import PickScreen from "./src/screens/PickScreen";
import TrainingScreen from "./src/screens/TrainingScreen";
import VideoAnalysisScreen from "./src/screens/VideoAnalysisScreen";
import WorkoutReportScreen from "./src/screens/WorkoutReportScreen";
import CustomizationScreen from "./src/screens/CustomizationScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import VoiceScreen from "./src/screens/VoiceScreen";
import { badgeCoachAudio, BADGE_AUDIO_PROTOCOL } from './src/voice/badgeCoachAudio';
import { SettingsProvider } from "./src/store/settings";
import { colors, pixelFont, spacing } from "./src/ui/theme";
import type {
  ProfileStackParamList,
  RootTabParamList,
  WorkoutStackParamList,
} from "./src/navigation";

const Tab = createBottomTabNavigator<RootTabParamList>();
const WorkoutStack = createNativeStackNavigator<WorkoutStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

/** 运动 tab 内部栈：选动作 → 实时姿势矫正（训练页无 header）。 */
function WorkoutNavigator() {
  return (
    <WorkoutStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkoutStack.Screen name="Pick" component={PickScreen} />
      <WorkoutStack.Screen name="Training" component={TrainingScreen} />
      <WorkoutStack.Screen name="VideoAnalysis" component={VideoAnalysisScreen} />
      <WorkoutStack.Screen name="WorkoutReport" component={WorkoutReportScreen} />
    </WorkoutStack.Navigator>
  );
}

/** 我的 tab 内部栈：个人中心 → 设置 / 音色（带浅色 header）。 */
function ProfileNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: true,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: pixelFont, fontWeight: "800" },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "个人资料" }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: "通用设置" }} />
      <ProfileStack.Screen name="Voice" component={VoiceScreen} options={{ title: "音色" }} />
    </ProfileStack.Navigator>
  );
}

/** 训练页为全屏摄像头，隐藏底部 tab 栏避免遮挡。 */
function workoutTabBarStyle(route: RouteProp<RootTabParamList, "Workout">) {
  const name = getFocusedRouteNameFromRoute(route) ?? "Pick";
  if (name === "Training" || name === "VideoAnalysis" || name === "WorkoutReport") {
    return { display: "none" as const };
  }
  return undefined;
}

/** 纯文字 tab，无图标。 */

/** 手机画框：仅在 web 上把应用限制成居中的手机尺寸，避免被宽屏拉伸。 */
const PHONE_WIDTH = 420;
const PHONE_HEIGHT = 880;

function PhoneFrame({ children }: { children: ReactNode }) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  if (Platform.OS !== "web") return <>{children}</>;
  const embedded = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "frost";
  if (embedded) {
    return <View style={styles.embedded}><View style={styles.embeddedApp}>{children}</View></View>;
  }
  const width = Math.min(PHONE_WIDTH, viewportWidth);
  const height = Math.min(PHONE_HEIGHT, viewportHeight);
  return (
    <View style={styles.webBackdrop}>
      <View style={[styles.phone, { width, height }]}>{children}</View>
    </View>
  );
}

/**
 * 底部两个 tab：运动（选动作→实时矫正）/ 我的（个人中心，设置含音色）。
 * Keep 浅色风格。动作分析始终使用真实模型服务，不提供桩演示。
 */
export default function App() {
  const embedded = Platform.OS === "web" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "frost";
  return (
    <PhoneFrame>
      <SafeAreaProvider>
        <SettingsProvider>
          <NavigationContainer onReady={() => {
            if (embedded && window.parent !== window) {
              // Readiness only: no task, image or user data crosses this wildcard message.
              // The host checks the iframe's origin and source window before accepting it.
              window.parent.postMessage({ protocol: 'pocket-lianlema/v1', type: 'view-ready',
                badgeAudioProtocol: badgeCoachAudio ? BADGE_AUDIO_PROTOCOL : undefined }, '*');
            }
          }}>
            <StatusBar style="dark" />
            {embedded ? <WorkoutNavigator /> : <Tab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.accentDeep,
                tabBarInactiveTintColor: colors.textFaint,
                tabBarStyle: styles.tabBar,
                tabBarLabelStyle: { fontFamily: pixelFont, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
                tabBarIconStyle: { display: "none" },
              }}
            >
              <Tab.Screen
                name="Workout"
                component={WorkoutNavigator}
                options={({ route }) => ({
                  title: "运动",
                  tabBarStyle: [styles.tabBar, workoutTabBarStyle(route)],
                })}
              />
              <Tab.Screen
                name="Customization"
                component={CustomizationScreen}
                options={{ title: "个性化" }}
              />
              <Tab.Screen
                name="Profile"
                component={ProfileNavigator}
                options={{
                  title: "我的",
                }}
              />
            </Tab.Navigator>}
          </NavigationContainer>
        </SettingsProvider>
      </SafeAreaProvider>
    </PhoneFrame>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 2,
    height: 62,
    paddingBottom: spacing(2),
    paddingTop: spacing(2.5),
  },
  webBackdrop: {
    flex: 1,
    minHeight: "100%",
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  phone: {
    backgroundColor: colors.bg,
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.border,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "8px 8px 0 #000" } as object)
      : {}),
  },
  embedded: {
    flex: 1,
    width: "100%",
    minHeight: "100%",
    backgroundColor: colors.bg,
  },
  embeddedApp: {
    flex: 1,
    width: "100%",
    minHeight: "100%",
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
});
