import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

struct CompanionEntry: TimelineEntry {
    let date: Date
    let state: PocketPresenceState
}
struct CompanionProvider: TimelineProvider {
    func placeholder(in context: Context) -> CompanionEntry { CompanionEntry(date: .now, state: PocketPresenceState()) }
    func getSnapshot(in context: Context, completion: @escaping (CompanionEntry) -> Void) {
        completion(CompanionEntry(date: .now, state: PocketPresenceStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CompanionEntry>) -> Void) {
        completion(Timeline(entries: [CompanionEntry(date: .now, state: PocketPresenceStore.read())], policy: .after(.now.addingTimeInterval(900))))
    }
}

struct CompanionPortrait: View {
    let index: Int
    let size: CGFloat
    var body: some View {
        if let url = Bundle.main.url(forResource: "buddy-\(index)", withExtension: "png", subdirectory: "PresenceAssets"),
           let source = UIImage(contentsOfFile: url.path) {
            // Bound the actual bitmap as well as the view, especially in the compact Island.
            let bitmap = UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { _ in
                source.draw(in: CGRect(x: 0, y: 0, width: size, height: size))
            }
            Image(uiImage: bitmap).resizable().scaledToFill().frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.3))
        } else {
            Image(systemName: "pawprint.fill").resizable().scaledToFit().frame(width: size, height: size).foregroundStyle(.brown)
        }
    }
}
struct CompanionCard: View {
    let state: PocketPresenceState
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("POCKET BUDDY").font(.system(size: 9, weight: .bold, design: .monospaced)).tracking(2).foregroundStyle(.secondary)
                Text(state.name).font(.system(size: 19, weight: .bold, design: .rounded)).lineLimit(2).minimumScaleFactor(0.75)
                Label(state.mood, systemImage: "heart.fill").font(.system(size: 11)).foregroundStyle(Color(red: 0.28, green: 0.43, blue: 0.34))
                Spacer(minLength: 0)
                Text(state.connectionLabel).font(.system(size: 9)).foregroundStyle(.secondary)
                if let battery = state.battery {
                    Label("\(battery)% · 上次电量", systemImage: "battery.75percent").font(.system(size: 9)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            CompanionPortrait(index: state.avatarIndex, size: 112)
                .scaleEffect(state.pose == "heart" ? 1.05 : 1)
                .animation(.spring(duration: 0.5), value: state.pose)
        }.padding(16).foregroundStyle(.black)
    }
}

struct PocketCompanionWidget: Widget {
    let kind = PocketPresenceStore.kind
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CompanionProvider()) { entry in
            CompanionCard(state: entry.state)
                .containerBackground(Color(red: 0.98, green: 0.97, blue: 0.93), for: .widget)
                .widgetURL(PocketPresenceStore.link)
        }
        .configurationDisplayName("桌面伙伴")
        .description("同一个伙伴，从吧唧来到你的桌面。只展示角色和上次同步的公开状态。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct PocketCompanionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PocketCompanionAttributes.self) { context in
            HStack(spacing: 14) {
                CompanionPortrait(index: context.state.avatarIndex, size: 56)
                VStack(alignment: .leading, spacing: 5) {
                    Text(context.state.name).font(.headline)
                    if context.isStale { Text("这次陪伴已到时").font(.caption) }
                    else { Text("陪你上街去").font(.caption); countdown(context).font(.caption.monospacedDigit()) }
                }
                Spacer()
                Button(intent: EndCompanionIntent()) { Image(systemName: "xmark.circle.fill").font(.title2) }
                    .buttonStyle(.plain).accessibilityLabel("结束陪伴")
            }.padding(16).foregroundStyle(.black)
                .activityBackgroundTint(Color(red: 0.96, green: 0.97, blue: 0.91))
                .activitySystemActionForegroundColor(.black)
                .widgetURL(PocketPresenceStore.link)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { CompanionPortrait(index: context.state.avatarIndex, size: 44) }
                DynamicIslandExpandedRegion(.trailing) {
                    Button(intent: EndCompanionIntent()) { Image(systemName: "xmark.circle.fill") }.accessibilityLabel("结束陪伴")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.name).font(.headline).lineLimit(1)
                        Spacer()
                        if context.isStale { Text("已到时").font(.caption) }
                        else { countdown(context).font(.caption.monospacedDigit()) }
                    }
                }
            } compactLeading: {
                Image(systemName: context.isStale ? "checkmark" : "heart.fill").foregroundStyle(.mint)
            } compactTrailing: {
                CompanionPortrait(index: context.state.avatarIndex, size: 28)
                    .scaleEffect(context.state.pose == "heart" ? 1.08 : 1)
                    .animation(.spring(duration: 0.5), value: context.state.pose)
            } minimal: {
                CompanionPortrait(index: context.state.avatarIndex, size: 24)
            }
            .widgetURL(PocketPresenceStore.link).keylineTint(.mint)
        }
    }
    private func countdown(_ context: ActivityViewContext<PocketCompanionAttributes>) -> some View {
        Text(timerInterval: context.attributes.startedAt...context.attributes.endsAt, countsDown: true)
    }
}

@main
struct PocketCompanionBundle: WidgetBundle {
    var body: some Widget {
        PocketCompanionWidget()
        PocketCompanionLiveActivity()
    }
}
