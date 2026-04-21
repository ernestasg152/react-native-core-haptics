import { NativeModule, requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface ScrubHapticsNativeModule extends NativeModule {
  /** Spin up the haptic engine and prime a pattern player. Cheap, idempotent. */
  prepare(): void;
  /** Fire a single transient. Non-coalescing when Core Haptics is used. */
  tick(): void;
  /** Called on touch end. Keeps the engine warm for a rapid re-touch. */
  stop(): void;
}

const nativeModule: ScrubHapticsNativeModule | null =
  Platform.OS === 'ios' ? requireNativeModule<ScrubHapticsNativeModule>('ScrubHaptics') : null;

export const ScrubHaptics = {
  prepare: () => {
    nativeModule?.prepare();
  },
  tick: () => {
    nativeModule?.tick();
  },
  stop: () => {
    nativeModule?.stop();
  },
};
