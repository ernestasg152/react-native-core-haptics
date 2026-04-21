package com.corehaptics

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.View
import com.margelo.nitro.NitroModules
import com.margelo.nitro.corehaptics.HapticParams
import com.margelo.nitro.corehaptics.HapticStyle
import com.margelo.nitro.corehaptics.HybridCoreHapticsSpec

/**
 * Android backend — dispatches via `View.performHapticFeedback`, the
 * same API every other RN haptics library uses. No permissions
 * required, respects the user's system haptic-feedback setting.
 *
 * Android can't express intensity/sharpness the way iOS's Core Haptics
 * can. Each named style maps to the closest `HapticFeedbackConstant`:
 *
 * - `selection`: `SEGMENT_TICK` (API 34+) or `CLOCK_TICK` (older).
 *    The scrub/slider-specific constant Android shipped in 14.
 * - `soft`:      `KEYBOARD_TAP` — a lighter tap.
 * - `strong`:    `LONG_PRESS` — a heavier, thuddier feel.
 *
 * `tickCustom` maps `intensity` to the closest preset; `sharpness` has
 * no analog and is ignored on Android.
 *
 * If no Activity is attached (app backgrounded, or called before the
 * first activity binds): silent no-op.
 */
class HybridCoreHaptics : HybridCoreHapticsSpec() {
    private val selectionConstant: Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            HapticFeedbackConstants.SEGMENT_TICK
        } else {
            HapticFeedbackConstants.CLOCK_TICK
        }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun prepare() = Unit

    override fun tick() {
        dispatch(selectionConstant)
    }

    override fun tickStyled(style: HapticStyle) {
        dispatch(constantFor(style))
    }

    override fun tickCustom(params: HapticParams) {
        // Android has no direct intensity control — pick the closest
        // preset based on params.intensity. Sharpness is unused.
        val intensity = params.intensity ?: 0.45
        val constant = when {
            intensity >= 0.7 -> constantFor(HapticStyle.STRONG)
            intensity >= 0.35 -> selectionConstant
            else -> constantFor(HapticStyle.SOFT)
        }
        dispatch(constant)
    }

    override fun stop() = Unit

    override fun teardown() = Unit

    private fun constantFor(style: HapticStyle): Int = when (style) {
        HapticStyle.SOFT -> HapticFeedbackConstants.KEYBOARD_TAP
        HapticStyle.STRONG -> HapticFeedbackConstants.LONG_PRESS
        HapticStyle.SELECTION -> selectionConstant
    }

    // `View.performHapticFeedback` touches `mAttachInfo`, a main-thread-
    // owned field. Worklet-dispatched calls happen on the UI thread
    // already, but plain JS-thread calls don't — post to main to be safe.
    // Fast-path when we're already on main avoids the Handler enqueue.
    private fun dispatch(constant: Int) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            currentDecorView()?.performHapticFeedback(constant)
        } else {
            mainHandler.post {
                currentDecorView()?.performHapticFeedback(constant)
            }
        }
    }

    private fun currentDecorView(): View? =
        NitroModules.applicationContext?.currentActivity?.window?.decorView
}
