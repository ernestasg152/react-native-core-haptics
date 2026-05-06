# react-native-core-haptics

Low-latency, non-coalescing haptic feedback for continuous input in React Native. Backed by iOS Core Haptics + Nitro Modules, so every scrub crossing fires a distinct tap (even under 60 Hz oscillation), and you can call it straight from a Reanimated worklet.

[![Version](https://img.shields.io/npm/v/react-native-core-haptics.svg)](https://www.npmjs.com/package/react-native-core-haptics)
[![License](https://img.shields.io/npm/l/react-native-core-haptics.svg)](LICENSE)
[![iOS build](https://github.com/ernestasg152/react-native-core-haptics/actions/workflows/ios-build.yml/badge.svg)](https://github.com/ernestasg152/react-native-core-haptics/actions/workflows/ios-build.yml)
[![Android build](https://github.com/ernestasg152/react-native-core-haptics/actions/workflows/android-build.yml/badge.svg)](https://github.com/ernestasg152/react-native-core-haptics/actions/workflows/android-build.yml)

## The problem

iOS gives you two haptic APIs. UIKit's feedback generators (`UIImpactFeedbackGenerator`, `UISelectionFeedbackGenerator`, `UINotificationFeedbackGenerator`) coalesce above ~25 Hz, so rapid threshold crossings on a chart scrubber or a slider step feel flat. Core Haptics (`CHHapticEngine`) doesn't coalesce; every transient fires.

But for high-rate continuous input, just reaching for Core Haptics is not enough. Two things matter on the gesture hot path:

1. **The pattern player is cached, not rebuilt per call.** Building a fresh `CHHapticPattern` and `CHHapticPatternPlayer` every tick is ~1ms of allocation on the gesture thread. At 60 Hz that's noticeable work running on the path that decides when the tick fires.
2. **The call is worklet-callable.** If a tick has to hop back to the JS thread before it touches native, you've added a bridge round-trip per gesture event.

## The solution

`react-native-core-haptics` is a small Nitro Module focused on the scrub use case:

- Per-style `CHHapticPatternPlayer`s are built once (lazily on first use, or eagerly via `prepare()`) and reused. The hot path allocates nothing.
- The hybrid object is JSI-resident, so `tick()` is callable directly from a Reanimated worklet without `runOnJS` and without a bridge hop.

Android dispatches via `View.performHapticFeedback` with `SEGMENT_TICK` on Android 14+ (the scrubber-specific constant the platform added in API 34) and `CLOCK_TICK` on older versions. No permissions required.

## Install

```bash
npm install react-native-core-haptics react-native-nitro-modules
```

iOS:

```bash
cd ios && pod install
```

Requirements:
- React Native **New Architecture enabled** (`newArchEnabled: true` in app.json, or `RCT_NEW_ARCH_ENABLED=1`)
- iOS **13+** (Core Haptics minimum)
- Android **API 21+** (best feel on API 34+ where `SEGMENT_TICK` is available)
- Reanimated **3+** and Gesture Handler if you want to call from worklets. The babel plugin name differs by major: Reanimated 3 uses `react-native-reanimated/plugin`, Reanimated 4 uses `react-native-worklets/plugin`. Make sure your `babel.config.js` matches the version you installed.

## Usage

For a working scrub demo with style switcher and a 200-step rate test, see [`example/`](./example).

```ts
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { CoreHaptics } from 'react-native-core-haptics'

const lastIndex = useSharedValue(0)

const pan = Gesture.Pan()
  .onBegin(() => {
    'worklet'
    CoreHaptics.prepare()
  })
  .onUpdate(e => {
    'worklet'
    const idx = Math.round(e.x / SEGMENT_WIDTH)
    if (idx !== lastIndex.value) {
      lastIndex.value = idx
      CoreHaptics.tick() // worklet-direct, no runOnJS
    }
  })
  .onEnd(() => {
    'worklet'
    CoreHaptics.stop()
  })
```

Non-worklet usage works too: `CoreHaptics.tick()` is safe to call from the JS thread.

## API

| Method | Purpose |
|---|---|
| `prepare()` | Warm up the engine + cache the default pattern player. Cheap, idempotent. Call on touch-start so the first `tick()` has zero cold-start latency. Optional. |
| `tick()` | Fire a single transient using the `selection` preset. Non-coalescing: each call produces a distinct buzz. Safe from worklets. |
| `tickStyled(style)` | Fire a transient using a named preset (see below). Each style gets its own cached player, still zero-alloc on the hot path. |
| `tickCustom({ intensity?, sharpness? })` | Raw `CHHapticEventParameter` control. iOS full; Android maps `intensity` → closest preset (`≥0.7` → `strong`, `0.35–0.7` → `selection`, `<0.35` → `soft`; `sharpness` is unused). Each call builds a fresh player (~1ms), so prefer `tickStyled` for 60 Hz hot paths. |
| `stop()` | Call on touch-end. Keeps the engine warm for rapid re-touch. |
| `teardown()` | Hard-shutdown the engine. Rarely needed; the engine auto-recovers from system interruptions. |

### Named styles

| Style | iOS (intensity / sharpness) | Android `HapticFeedbackConstant` |
|---|:---:|---|
| `selection` (default) | 0.45 / 0.6 (matches `UISelectionFeedbackGenerator`) | `SEGMENT_TICK` (API 34+) · `CLOCK_TICK` (older) |
| `soft` | 0.3 / 0.3 (duller, lower-intensity) | `KEYBOARD_TAP` |
| `strong` | 0.9 / 0.9 (sharper, heavier) | `LONG_PRESS` |

## How it compares

| | worklet-callable | iOS backend | Android backend | min iOS |
|---|:-:|---|---|:-:|
| `expo-haptics` | ❌ | UIKit feedback generators (coalesce >25 Hz) | `HapticFeedbackConstants` | 13 |
| `react-native-haptic-feedback` | ❌ | `CHHapticEngine` (player rebuilt per call) with UIKit fallback | `Vibrator` / `VibrationEffect` | 10 |
| `react-native-nitro-haptics` | ✅ | `UISelectionFeedbackGenerator` (coalesces >25 Hz) | `HapticFeedbackConstants` | 13 |
| **`react-native-core-haptics`** | **✅** | **`CHHapticEngine` (cached per-style players, zero-alloc hot path)** | **`HapticFeedbackConstants.SEGMENT_TICK` (API 34+)** | 13 |

## When to use this vs `expo-haptics`

Use `expo-haptics` for discrete event haptics: button taps, notifications, success/error feedback. The coalescing behavior is a feature there, not a bug.

Use `react-native-core-haptics` for continuous-input haptics: scrub bars, sliders, lists with snap-to, gesture boundaries. Anywhere the user crosses a threshold and you want them to *feel* the crossing, not a coalesced average.

The two can coexist in the same app.

## FAQ

**Why not an Expo module?** Expo modules can't do JSI worklet dispatch as cleanly as Nitro can. Since worklet-callable `tick()` is half the reason this package exists, Nitro is the right primitive. Expo apps still install this via normal autolinking; you don't need to eject or use a config plugin.

**Does it replace `expo-haptics`?** No. Different use cases (see above).

**What about iPads / older iPhones?** Core Haptics isn't available on most iPads or on iPhones before the 8. When `CHHapticEngine.capabilitiesForHardware().supportsHaptics` is false, the iOS path falls back to `UISelectionFeedbackGenerator`. You'll still get *some* haptics, just with the coalescing behavior of that API.

**What about `react-native-haptic-feedback`'s `ignoreAndroidSystemSettings`?** Not supported; this package respects the user's system haptic setting.

**Can I tune the feel?** Yes. Either pick a named preset with `tickStyled('soft' | 'strong')` or pass raw parameters with `tickCustom({ intensity, sharpness })` (iOS full; Android picks the closest preset). The `tick()` hot path keeps the defaults (0.45 / 0.6, matching `UISelectionFeedbackGenerator`).

## Credits

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module). Engine lifecycle pattern informed by the Core Haptics cookbook and the [Capturing the fine details of a gesture](https://developer.apple.com/documentation/corehaptics) WWDC sample.

## License

MIT. See [LICENSE](LICENSE).
