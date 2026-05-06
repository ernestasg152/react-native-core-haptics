import ExpoModulesCore
import CoreHaptics
import UIKit

/// Low-latency transient haptic for chart scrubbing. Uses Core Haptics
/// (CHHapticEngine + pre-built pattern player) so each tick() fires a
/// distinct transient without the coalescing that UISelectionFeedbackGenerator
/// applies when called more than ~25Hz — which is exactly the rate users hit
/// when oscillating across a scrub boundary.
///
/// Falls back to UISelectionFeedbackGenerator if the device doesn't support
/// Core Haptics (older iPhones / some iPads).
public class ScrubHapticsModule: Module {
  private var engine: CHHapticEngine?
  private var player: CHHapticPatternPlayer?
  private var supportsHaptics: Bool = false
  private var fallbackGenerator: UISelectionFeedbackGenerator?
  private let queue = DispatchQueue(label: "com.blockgames.scrub-haptics", qos: .userInteractive)
  private var isStarted: Bool = false

  public func definition() -> ModuleDefinition {
    Name("ScrubHaptics")

    OnCreate {
      self.supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
      if !self.supportsHaptics {
        self.fallbackGenerator = UISelectionFeedbackGenerator()
      }
    }

    OnDestroy {
      self.tearDown()
    }

    // Call on touch-start. Spins up the haptic engine and primes the player
    // so the first tick() on the next crossing has zero warm-up latency.
    Function("prepare") { () -> Void in
      self.prepareInternal()
    }

    // Call on every integer crossing during scrub. Fires a single transient
    // haptic via an already-built pattern player — no per-call allocation,
    // no coalescing.
    Function("tick") { () -> Void in
      self.tickInternal()
    }

    // Call on touch-end. Leaves the engine idle but alive so a rapid
    // re-touch is still warm; calling prepare() again is cheap if needed.
    Function("stop") { () -> Void in
      self.stopInternal()
    }
  }

  // MARK: - Private

  private func prepareInternal() {
    guard supportsHaptics else {
      fallbackGenerator?.prepare()
      return
    }

    queue.sync {
      do {
        if engine == nil {
          try buildEngine()
        }
        if !isStarted {
          try engine?.start()
          isStarted = true
        }
        if player == nil {
          try buildPlayer()
        }
      } catch {
        // If Core Haptics fails for any reason, fall back.
        supportsHaptics = false
        fallbackGenerator = UISelectionFeedbackGenerator()
        fallbackGenerator?.prepare()
      }
    }
  }

  private func tickInternal() {
    guard supportsHaptics else {
      fallbackGenerator?.selectionChanged()
      // UISelectionFeedbackGenerator needs a re-prepare to stay warm.
      fallbackGenerator?.prepare()
      return
    }

    queue.async { [weak self] in
      guard let self = self else { return }
      do {
        if self.engine == nil {
          try self.buildEngine()
        }
        if !self.isStarted {
          try self.engine?.start()
          self.isStarted = true
        }
        if self.player == nil {
          try self.buildPlayer()
        }
        try self.player?.start(atTime: CHHapticTimeImmediate)
      } catch {
        // Engine may have died (app backgrounded etc.). Recreate and try once.
        self.player = nil
        self.engine = nil
        self.isStarted = false
        do {
          try self.buildEngine()
          try self.engine?.start()
          self.isStarted = true
          try self.buildPlayer()
          try self.player?.start(atTime: CHHapticTimeImmediate)
        } catch {
          // Give up silently — a dropped tick is better than a crash.
        }
      }
    }
  }

  private func stopInternal() {
    guard supportsHaptics else { return }
    // Keep the engine alive but idle. Rebuilding the engine is expensive;
    // a touch-out followed by a new touch-down within a few seconds is
    // common, so we avoid tearing down here.
  }

  private func buildEngine() throws {
    let eng = try CHHapticEngine()
    // Don't grab the audio session — we only play haptics, never audio.
    // Without this, starting the engine can duck other audio (music /
    // other apps' playback) on some iOS versions.
    eng.playsHapticsOnly = true
    eng.isAutoShutdownEnabled = false
    eng.stoppedHandler = { [weak self] _ in
      self?.queue.async {
        self?.isStarted = false
      }
    }
    eng.resetHandler = { [weak self] in
      self?.queue.async {
        guard let self = self else { return }
        do {
          try self.engine?.start()
          self.isStarted = true
          try self.buildPlayer()
        } catch {
          self.isStarted = false
        }
      }
    }
    self.engine = eng
  }

  private func buildPlayer() throws {
    guard let engine = engine else { return }
    // Light, crisp transient — close to UISelectionFeedbackGenerator.
    let event = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.45),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6),
      ],
      relativeTime: 0
    )
    let pattern = try CHHapticPattern(events: [event], parameters: [])
    self.player = try engine.makePlayer(with: pattern)
  }

  private func tearDown() {
    queue.sync {
      self.player = nil
      if self.isStarted {
        try? self.engine?.stop()
        self.isStarted = false
      }
      self.engine = nil
    }
  }
}
