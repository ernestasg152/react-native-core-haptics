import type { HybridObject } from 'react-native-nitro-modules'

/**
 * A named preset. Each maps to a pair of (intensity, sharpness) values
 * on iOS and to a `HapticFeedbackConstant` on Android.
 *
 * - `selection` (default): matches the UISelection / SEGMENT_TICK feel.
 *   Intensity 0.45, sharpness 0.6 on iOS.
 * - `soft`: duller, lower-intensity. For large lists where rapid
 *   crossings would otherwise feel overwhelming.
 * - `strong`: sharper, heavier. For important boundaries you want the
 *   user to really notice.
 */
export type HapticStyle = 'selection' | 'soft' | 'strong'

/**
 * Raw Core Haptics parameters. Used only by `tickCustom`.
 *
 * - `intensity`: 0.0–1.0. How strong the buzz feels. Default 0.45.
 * - `sharpness`: 0.0–1.0. How "crisp" vs "dull" the buzz feels.
 *   Default 0.6.
 *
 * On Android these are approximated: the intensity value picks the
 * closest of the three preset `HapticFeedbackConstants`. Sharpness
 * has no analog on Android and is ignored.
 */
export interface HapticParams {
  intensity?: number
  sharpness?: number
}

/**
 * Low-latency transient haptic for continuous input (chart scrubbing,
 * sliders).
 *
 * iOS: Core Haptics (CHHapticEngine + pre-built pattern players) so
 * rapid crossings don't get coalesced the way UISelectionFeedbackGenerator
 * does. One pattern player is cached per style for the zero-allocation
 * hot path; `tickCustom` builds inline.
 *
 * Android: View.performHapticFeedback with SEGMENT_TICK on API 34+ and
 * CLOCK_TICK as the older-API fallback. No permissions required — the
 * platform handles it via the current Activity's decor view.
 */
export interface CoreHaptics
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Warm up the haptic engine and build the default pattern player.
   * Cheap, idempotent. Call on touch-start so the first `tick()` has
   * zero cold-start latency. Optional — any tick method will prepare
   * implicitly if needed.
   */
  prepare(): void

  /**
   * Fire a single transient using the `selection` preset.
   * Non-coalescing: each call produces a distinct buzz, even at 60+ Hz.
   * Safe to call from a Reanimated worklet via Nitro's HybridObject
   * dispatch.
   */
  tick(): void

  /**
   * Fire a single transient using a named preset. See `HapticStyle` for
   * the available styles.
   */
  tickStyled(style: HapticStyle): void

  /**
   * Fire a transient with raw intensity / sharpness values. iOS only;
   * Android approximates by mapping `intensity` to the closest preset.
   * Each call to `tickCustom` builds a fresh pattern player on iOS
   * (the engine is already warm, so this is fast — ~1ms — but if you
   * call this at 60 Hz you will allocate 60 players per second; prefer
   * `tickStyled` for cached hot paths).
   */
  tickCustom(params: HapticParams): void

  /**
   * Call on touch-end. Keeps the engine warm for rapid re-touch; does
   * NOT tear down. If you need to hard-stop the engine (e.g. for
   * battery on a backgrounding app) call `teardown()`.
   */
  stop(): void

  /**
   * Hard-shutdown the engine. Next `prepare()` or tick rebuilds.
   * Rarely needed — the engine auto-recovers from system interruptions.
   */
  teardown(): void
}
