import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

import { CoreHaptics, type HapticStyle } from 'react-native-core-haptics'

const TRACK_WIDTH = 320
const TRACK_HEIGHT = 56
const THUMB_SIZE = 36
const STYLES: HapticStyle[] = ['selection', 'soft', 'strong']
const TICK_COUNTS = [10, 40, 100, 200]

export default function App() {
  const [style, setStyle] = useState<HapticStyle>('selection')
  const [tickCount, setTickCount] = useState<number>(40)

  useEffect(() => {
    CoreHaptics.prepare()
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Core Haptics</Text>
        <Text style={styles.subtitle}>
          Drag the thumb. Each step fires a distinct transient — even at 200
          steps across 320pt, no coalescing.
        </Text>

        <HapticSlider
          key={tickCount}
          style={style}
          tickCount={tickCount}
        />

        <SegmentedRow label="Style">
          {STYLES.map(s => (
            <Segment
              key={s}
              label={s}
              active={s === style}
              onPress={() => {
                setStyle(s)
                // Preview the feel on tap.
                CoreHaptics.tickStyled(s)
              }}
            />
          ))}
        </SegmentedRow>

        <SegmentedRow label="Steps">
          {TICK_COUNTS.map(n => (
            <Segment
              key={n}
              label={String(n)}
              active={n === tickCount}
              onPress={() => setTickCount(n)}
            />
          ))}
        </SegmentedRow>
      </View>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  )
}

function HapticSlider({
  style,
  tickCount,
}: {
  style: HapticStyle
  tickCount: number
}) {
  const offset = useSharedValue(0)
  const start = useSharedValue(0)
  const lastIndex = useSharedValue(0)
  const segment = TRACK_WIDTH / tickCount
  // Hide individual tick lines once they get too dense to render usefully.
  const showTicks = tickCount <= 100

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
          const raw = clamp(start.value + e.translationX, 0, TRACK_WIDTH)
          const idx = Math.round(raw / segment)
          offset.value = idx * segment
          if (idx !== lastIndex.value) {
            lastIndex.value = idx
            CoreHaptics.tickStyled(style)
          }
        })
        .onEnd(() => {
          'worklet'
          start.value = offset.value
          CoreHaptics.stop()
        }),
    [offset, lastIndex, start, segment, style]
  )

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  const ticks = useMemo(() => {
    if (!showTicks) return null
    return Array.from({ length: tickCount + 1 }, (_, i) => (
      <View
        key={i}
        style={[
          styles.tick,
          {
            left: segment * i - 1 + THUMB_SIZE / 2,
            height: i % 10 === 0 ? 14 : 8,
            top: TRACK_HEIGHT / 2 - (i % 10 === 0 ? 7 : 4),
          },
        ]}
      />
    ))
  }, [tickCount, segment, showTicks])

  return (
    <View style={styles.sliderWrap}>
      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          {showTicks ? (
            ticks
          ) : (
            <View
              style={[
                styles.denseRail,
                { left: THUMB_SIZE / 2, width: TRACK_WIDTH },
              ]}
            />
          )}
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  )
}

function SegmentedRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.segmentedRow}>
      <Text style={styles.segmentedLabel}>{label}</Text>
      <View style={styles.segmentedTrack}>{children}</View>
    </View>
  )
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.segment, active && styles.segmentActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.segmentText, active && styles.segmentTextActive]}
      >
        {label}
      </Text>
    </Pressable>
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
    marginBottom: 32,
    textAlign: 'center',
    maxWidth: 320,
  },
  sliderWrap: {
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  track: {
    width: TRACK_WIDTH + THUMB_SIZE,
    height: TRACK_HEIGHT,
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#2f2f3a',
  },
  denseRail: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2f2f3a',
    top: TRACK_HEIGHT / 2 - 2,
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
  segmentedRow: {
    width: '100%',
    maxWidth: TRACK_WIDTH + THUMB_SIZE,
    marginBottom: 16,
  },
  segmentedLabel: {
    color: '#9a9aa3',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  segmentedTrack: {
    flexDirection: 'row',
    backgroundColor: '#1c1c24',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 7,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#3a3a48',
  },
  segmentText: {
    color: '#9a9aa3',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  segmentTextActive: {
    color: '#fff',
  },
})
