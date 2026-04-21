import { NitroModules } from 'react-native-nitro-modules'

import type { CoreHaptics as CoreHapticsSpec } from './specs/core-haptics.nitro'

export type { HapticStyle, HapticParams } from './specs/core-haptics.nitro'

/**
 * Low-latency, non-coalescing haptic feedback for continuous input.
 *
 * On iOS: backed by Core Haptics — each call fires a distinct
 * transient, even at 60+ Hz, unlike `UISelectionFeedbackGenerator`
 * which the OS coalesces above ~25 Hz. Pre-built
 * `CHHapticPatternPlayer`s are cached per named style so the hot path
 * allocates nothing.
 *
 * Safe to call from a Reanimated worklet: the hybrid object is already
 * JSI-resident, no `runOnJS` needed.
 *
 * On Android: `View.performHapticFeedback` with `SEGMENT_TICK` on
 * Android 14+ (the scrubber-specific constant) and `CLOCK_TICK` on
 * older versions. No permissions required. Style-specific mappings:
 * `soft` → `KEYBOARD_TAP`, `strong` → `LONG_PRESS`.
 *
 * @example
 * ```ts
 * import { CoreHaptics } from 'react-native-core-haptics'
 *
 * // Default scrub tick
 * CoreHaptics.tick()
 *
 * // Named preset — lighter / heavier feels
 * CoreHaptics.tickStyled('soft')
 * CoreHaptics.tickStyled('strong')
 *
 * // Raw intensity + sharpness (iOS full control; Android
 * // approximates via the closest preset based on intensity)
 * CoreHaptics.tickCustom({ intensity: 0.7, sharpness: 0.9 })
 * ```
 */
export const CoreHaptics =
  NitroModules.createHybridObject<CoreHapticsSpec>('CoreHaptics')
