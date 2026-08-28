import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('iOS FrostBadge bridge entry points', () => {
  it('uses the plugin-registering controller in the active scene, not a bare Capacitor bridge', () => {
    const scene = source('ios/App/App/SceneDelegate.swift');
    expect(scene).toMatch(/rootViewController\s*=\s*PocketBuddyViewController\(\)/);
    expect(scene).not.toMatch(/rootViewController\s*=\s*CAPBridgeViewController\(\)/);
    expect(source('ios/App/App/AppDelegate.swift')).toContain('config.delegateClass = SceneDelegate.self');
  });

  it('registers the same native plugin used by the web client', () => {
    expect(source('ios/App/App/PocketBuddyViewController.swift')).toContain('bridge?.registerPluginInstance(FrostBadgePlugin())');
    expect(source('native/frost-badge/ios/FrostBadgePlugin.swift')).toContain('jsName = "FrostBadge"');
    expect(source('src/app/lib/frostBadge.ts')).toContain("registerPlugin<NativeBadge>('FrostBadge')");
  });

  it('also keeps the storyboard entry and scene source in the compiled App target', () => {
    expect(source('ios/App/App/Base.lproj/Main.storyboard')).toContain('customClass="PocketBuddyViewController"');
    const project = source('ios/App/App.xcodeproj/project.pbxproj');
    const sources = project.split('/* Begin PBXSourcesBuildPhase section */')[1]?.split('/* End PBXSourcesBuildPhase section */')[0];
    for (const file of ['SceneDelegate.swift', 'PocketBuddyViewController.swift', 'FrostBadgePlugin.swift']) {
      expect(sources).toContain(`${file} in Sources`);
    }
  });
  it('keeps badge ASR explicitly on-device, bounded, cancellable and separate from task execution', () => {
    const native = source('native/frost-badge/ios/FrostBadgePlugin.swift');
    expect(native).toContain('recognizer.supportsOnDeviceRecognition');
    expect(native).toContain('request.requiresOnDeviceRecognition = true');
    expect(native).toContain('data.count <= 960000');
    expect(native).toContain('self.speechCall === call');
    expect(native).toContain('request.endAudio()');
    expect(native).toContain('"cancelTranscription"');
    expect(native).not.toContain('AVAudioEngine');
    expect(native).not.toContain('URLSession');
    expect(source('ios/App/App/Info.plist')).toContain('NSSpeechRecognitionUsageDescription');
    const ui = source('src/app/components/FrostBadgeSpeechControls.tsx');
    expect(ui).not.toContain('sendFrostAgentMessage');
    expect(ui).not.toContain('issueFrostApproval');
    expect(source('src/main.tsx')).toContain('companion.start()');
    expect(source('src/app/components/FrostBadgePanel.tsx')).not.toContain('projectPose(');
  });
  it('uses bounded system speech buffers, a resampling converter, and the same cancellable badge PCM channel', () => {
    const native = source('native/frost-badge/ios/FrostBadgePlugin.swift');
    expect(native).toContain('"synthesizeSpeech"');
    expect(native).toContain('"cancelSynthesis"');
    expect(native).toContain('text.count <= 100');
    expect(native).toContain('synth.write(utterance)');
    expect(native).toContain('converter.convert(to: output, error: &error)');
    expect(native).toContain('sampleRate: 16000, channels: 1');
    expect(native).toContain('synthesisPCM.count + bytes <= 960000');
    expect(native).not.toContain('synth.speak(');
  });
});
