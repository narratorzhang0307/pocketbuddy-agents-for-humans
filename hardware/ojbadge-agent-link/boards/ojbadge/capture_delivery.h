#pragma once

namespace ojbadge {
// Called only by the microphone worker, never the BLE host callback. A failed
// notify was not queued; retry it without duplicating an accepted start/end.
constexpr unsigned kCaptureEventAttempts = 500;
constexpr unsigned kCaptureEventRetryMs = 20;

template<class Ready, class Send, class Pause>
bool DeliverCaptureEvent(Ready ready, Send send, Pause pause) {
    for (unsigned attempt = 0; attempt < kCaptureEventAttempts; ++attempt) {
        if (!ready()) return false;
        if (send()) return true;
        if (attempt + 1 < kCaptureEventAttempts) pause();
    }
    return false;
}
}  // namespace ojbadge
