import Capacitor

final class PocketBuddyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(FrostBadgePlugin())
        bridge?.registerPluginInstance(FrostHealthPlugin())
        #if DEBUG
        print("[PocketBuddy] FrostBadge registered: \(bridge?.plugin(withName: "FrostBadge") != nil)")
        #endif
    }
}
