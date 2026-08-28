import Capacitor
import UIKit

final class PocketBuddyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(FrostBadgePlugin())
        bridge?.registerPluginInstance(FrostHealthPlugin())
        bridge?.registerPluginInstance(PocketPresencePlugin())
        #if DEBUG
        print("[PocketBuddy] FrostBadge registered: \(bridge?.plugin(withName: "FrostBadge") != nil)")
        #endif
    }
    override var canBecomeFirstResponder: Bool { true }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }
    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { NotificationCenter.default.post(name: .pocketPresenceShake, object: nil) }
        else { super.motionEnded(motion, with: event) }
    }
}
