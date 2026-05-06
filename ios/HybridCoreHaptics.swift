import CoreHaptics
import Foundation
import UIKit

/// Low-latency transient haptic for continuous input (chart scrubbing,
/// sliders). Uses Core Haptics (CHHapticEngine + pre-built pattern
/// players) so each tick fires a distinct transient without the
/// coalescing that UISelectionFeedbackGenerator applies above ~25 Hz.
///
/// Three preset styles — `selection`, `soft`, `strong` — each get their
/// own cached CHHapticPatternPlayer, lazily built on first use. The
/// `tickCustom(params:)` path builds a fresh player per call (no cache
/// because the parameter space is continuous); the engine is already
/// warm so the allocation is ~1ms.
///
/// Falls back to UISelectionFeedbackGenerator on devices that don't
/// support Core Haptics (older iPhones, most iPads). The fallback
/// can't honor style variations and treats every call as a selection
/// change.
final class HybridCoreHaptics: HybridCoreHapticsSpec {
  private var engine: CHHapticEngine?
  private var players: [HapticStyle: CHHapticPatternPlayer] = [:]
  // Single-entry cache for `tickCustom`. If params match the last call,
  // we reuse the player and skip allocation. Fresh params reset it.
  private var customPlayer: CHHapticPatternPlayer?
  private var customKey: CustomKey?
  private var supportsHaptics: Bool
  private var fallbackGenerator: UISelectionFeedbackGenerator?
  private let queue = DispatchQueue(
    label: "com.corehaptics.queue",
    qos: .userInteractive
  )
  private var isStarted: Bool = false

  override init() {
    self.supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    super.init()
    if !self.supportsHaptics {
      self.fallbackGenerator = UISelectionFeedbackGenerator()
    }
  }

  deinit {
    tearDownSync()
  }

  // MARK: - Protocol

  // `prepare()` uses queue.sync — touch-start is ok to briefly block the
  // caller; we want the engine warm AND the default player cached before
  // the first crossing.
  func prepare() throws {
    guard supportsHaptics else {
      fallbackGenerator?.prepare()
      return
    }
    queue.sync {
      do {
        try prime()
        _ = try playerFor(style: .selection)
      } catch {
        // If Core Haptics fails, switch permanently to the fallback path.
        supportsHaptics = false
        fallbackGenerator = UISelectionFeedbackGenerator()
        fallbackGenerator?.prepare()
      }
    }
  }

  // `tick()`, `tickStyled`, `tickCustom` all use queue.async — must never
  // block the caller (JS worklet or UI thread). A single silent retry
  // handles engine deaths from backgrounding; a second failure drops the
  // tick rather than crashing.

  func tick() throws {
    play(cacheKey: .selection, intensity: nil, sharpness: nil)
  }

  func tickStyled(style: HapticStyle) throws {
    play(cacheKey: style, intensity: nil, sharpness: nil)
  }

  func tickCustom(params: HapticParams) throws {
    let (i, s) = resolveParams(params)
    play(cacheKey: nil, intensity: i, sharpness: s)
  }

  func stop() throws {
    // Keep the engine alive but idle. Rebuilding is expensive; a
    // touch-out followed by a re-touch within a few seconds is common,
    // so we avoid tearing down here. Call teardown() for hard shutdown.
  }

  func teardown() throws {
    tearDownSync()
  }

  // MARK: - Private (queue-bound unless noted)

  /// Unified playback. `cacheKey` non-nil → use/populate the cached
  /// player for that style and ignore `intensity`/`sharpness`. `cacheKey`
  /// nil → build a fresh player from `intensity` + `sharpness`.
  private func play(cacheKey: HapticStyle?, intensity: Float?, sharpness: Float?) {
    guard supportsHaptics else {
      fallbackGenerator?.selectionChanged()
      // UISelectionFeedbackGenerator needs a re-prepare to stay warm.
      fallbackGenerator?.prepare()
      return
    }
    queue.async { [weak self] in
      guard let self = self else { return }
      do {
        try self.prime()
        try self.playerFor(
          style: cacheKey,
          intensity: intensity,
          sharpness: sharpness
        )?.start(atTime: CHHapticTimeImmediate)
      } catch {
        // Engine likely died (app backgrounded). Rebuild once.
        self.resetEngine()
        do {
          try self.prime()
          try self.playerFor(
            style: cacheKey,
            intensity: intensity,
            sharpness: sharpness
          )?.start(atTime: CHHapticTimeImmediate)
        } catch {
          // Give up silently — a dropped tick beats a crash.
        }
      }
    }
  }

  /// Resolve (or build) a player. Styled calls go through the per-
  /// style cache; custom calls share a single-entry cache keyed by the
  /// exact intensity/sharpness pair so stable-param `tickCustom` doesn't
  /// re-allocate each call.
  private func playerFor(
    style: HapticStyle?,
    intensity: Float?,
    sharpness: Float?
  ) throws -> CHHapticPatternPlayer? {
    if let style = style {
      return try playerFor(style: style)
    }
    let i = intensity ?? 0.45
    let s = sharpness ?? 0.6
    let key = CustomKey(intensity: i, sharpness: s)
    if key == customKey, let cached = customPlayer {
      return cached
    }
    let player = try makePlayer(intensity: i, sharpness: s)
    customKey = key
    customPlayer = player
    return player
  }

  private func playerFor(style: HapticStyle) throws -> CHHapticPatternPlayer? {
    if let cached = players[style] {
      return cached
    }
    let (i, s) = style.params
    let player = try makePlayer(intensity: i, sharpness: s)
    if let player = player {
      players[style] = player
    }
    return player
  }

  private func makePlayer(
    intensity: Float,
    sharpness: Float
  ) throws -> CHHapticPatternPlayer? {
    guard let engine = engine else { return nil }
    let event = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: 0
    )
    let pattern = try CHHapticPattern(events: [event], parameters: [])
    return try engine.makePlayer(with: pattern)
  }

  private func prime() throws {
    if engine == nil { try buildEngine() }
    if !isStarted {
      try engine?.start()
      isStarted = true
    }
  }

  private func resetEngine() {
    players.removeAll()
    customPlayer = nil
    customKey = nil
    engine = nil
    isStarted = false
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
          // Players tied to a dead engine can't be reused — they were
          // minted by engine.makePlayer. Drop the caches; next tick
          // will rebuild on demand.
          self.players.removeAll()
          self.customPlayer = nil
          self.customKey = nil
        } catch {
          self.isStarted = false
        }
      }
    }
    self.engine = eng
  }

  private func tearDownSync() {
    queue.sync {
      self.players.removeAll()
      self.customPlayer = nil
      self.customKey = nil
      if self.isStarted {
        try? self.engine?.stop()
        self.isStarted = false
      }
      self.engine = nil
    }
  }

  /// Clamp + unwrap HapticParams into concrete Floats.
  private func resolveParams(_ params: HapticParams) -> (Float, Float) {
    let i = Float(params.intensity ?? 0.45)
    let s = Float(params.sharpness ?? 0.6)
    return (clamp(i), clamp(s))
  }

  private func clamp(_ v: Float) -> Float {
    return min(max(v, 0), 1)
  }
}

// MARK: - Preset parameters

private extension HapticStyle {
  /// (intensity, sharpness) for each named preset.
  var params: (Float, Float) {
    switch self {
    case .selection: return (0.45, 0.6)
    case .soft:      return (0.3, 0.3)
    case .strong:    return (0.9, 0.9)
    }
  }
}

/// Equality-keyed identifier for the custom-player cache. Exact-match
/// Float comparison is intentional — if a caller passes stable params
/// (e.g. stored in a shared value), the cache hits; drifting params
/// will miss and rebuild, which is the same cost as never caching.
private struct CustomKey: Equatable {
  let intensity: Float
  let sharpness: Float
}
