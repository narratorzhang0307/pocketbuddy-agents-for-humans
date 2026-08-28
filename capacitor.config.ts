import type { CapacitorConfig } from '@capacitor/cli';

const liveUrl = process.env.POCKET_BUDDY_LIVE_URL?.trim();
const iosBuild = process.env.POCKET_BUDDY_BUILD_TARGET === 'ios' || process.argv.includes('ios');

if (iosBuild && liveUrl) {
  throw new Error('iOS 使用本地资源包；请先取消 POCKET_BUDDY_LIVE_URL，再运行 npm run ios:prepare。');
}

const config: CapacitorConfig = {
  // Independent Pocket Buddy package with its own model/cache directory.
  appId: 'art.throughtheglass.pocketbuddy',
  appName: 'Pocket Buddy',
  webDir: iosBuild ? 'dist-ios' : 'dist',
  appendUserAgent: ' PocketBuddyMobile/1.0',
  ...(liveUrl ? {
    server: {
      url: liveUrl,
      cleartext: false,
      allowNavigation: ['pocketbuddy.throughtheglass.art'],
    },
  } : {}),
  android: {
    backgroundColor: '#eaeaea',
  },
  ios: {
    backgroundColor: '#eaeaea',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false,
      animation: 'NONE',
    },
  },
};

export default config;
