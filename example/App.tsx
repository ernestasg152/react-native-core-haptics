import { StatusBar } from 'expo-status-bar'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

import { CoreHaptics } from 'react-native-core-haptics'

const TRACK_WIDTH = 300
const TRACK_HEIGHT = 64
const TICK_COUNT = 10
const THUMB_SIZE = 44

export default function App() {
  const offset = useSharedValue(0)
  const start = useSharedValue(0)
  const lastIndex = useSharedValue(0)
  const [displayIndex, setDisplayIndex] = useState(0)

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          'worklet'
          CoreHaptics.prepare()
        })
        .onUpdate(e => {
          'worklet'
          const next = clamp(start.value + e.translationX, 0, TRACK_WIDTH)
          offset.value = next

          const segment = TRACK_WIDTH / TICK_COUNT
          const idx = Math.min(
            TICK_COUNT,
            Math.max(0, Math.round(next / segment))
          )
          if (idx !== lastIndex.value) {
            lastIndex.value = idx
            // Worklet-direct call — no runOnJS, no bridge hop.
            CoreHaptics.tick()
            runOnJS(setDisplayIndex)(idx)
          }
        })
        .onEnd(() => {
          'worklet'
          start.value = offset.value
          CoreHaptics.stop()
        }),
    [offset, lastIndex, start]
  )

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT + 1 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.tick,
            { left: (TRACK_WIDTH / TICK_COUNT) * i - 1 + THUMB_SIZE / 2 },
          ]}
        />
      )),
    []
  )

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Core Haptics scrub demo</Text>
        <Text style={styles.subtitle}>
          Drag the thumb. Every integer crossing fires a distinct transient —
          no coalescing, even under rapid back-and-forth.
        </Text>

        <GestureDetector gesture={pan}>
          <View style={styles.track}>
            {ticks}
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </GestureDetector>

        <Text style={styles.index}>
          idx: <Text style={styles.indexValue}>{displayIndex}</Text>
        </Text>
      </View>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  )
}

function clamp(x: number, min: number, max: number) {
  'worklet'
  if (x < min) return min
  if (x > max) return max
  return x
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b10' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9a9aa3',
    fontSize: 14,
    marginBottom: 40,
    textAlign: 'center',
    maxWidth: 320,
  },
  track: {
    width: TRACK_WIDTH + THUMB_SIZE,
    height: TRACK_HEIGHT,
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: 2,
    height: 14,
    backgroundColor: '#2f2f3a',
    top: TRACK_HEIGHT / 2 - 7,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#f5f5f7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  index: {
    color: '#9a9aa3',
    fontSize: 14,
    marginTop: 32,
  },
  indexValue: {
    color: '#fff',
    fontWeight: '700',
  },
})
