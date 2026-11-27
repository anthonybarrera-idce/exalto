import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const VIDEO = require('@/assets/videos/welcome-gradient.mp4');

/**
 * Welcome-page background: the brand wash (Exalto blue → amber → dark warm brown), with a looping video of the
 * same colors drifting over it (`assets/videos/welcome-gradient.mp4`, a 12 s seamless loop).
 *
 * The static gradient is always underneath: it shows until the video's first frame is drawn (the video then
 * fades in), and it's all that renders with Reduce Motion on. The video is muted and mixes with other audio,
 * so it never interrupts a hymn that's playing. The player is released when the welcome page unmounts (the
 * sheet closes or moves to another page).
 */
export function WelcomeGradient() {
  const reduceMotion = useReducedMotion();
  // The account sheet pads its pages by the bottom safe area; reach under it so the background fills the
  // screen to the very bottom (the page's buttons still sit above the home indicator).
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[StyleSheet.absoluteFill, { bottom: -bottom }]} pointerEvents="none">
      <LinearGradient
        colors={['#04A9E6', '#0F7AA3', '#B8772F', '#5A3518']}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {!reduceMotion && <GradientVideo />}
    </View>
  );
}

function GradientVideo() {
  const [shown, setShown] = useState(false);
  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });
  // On web the player only drives <video> elements that are already mounted, so the play() in setup is a no-op
  // there; start it again once the view exists.
  useEffect(() => {
    player.play();
  }, [player]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, shown ? VISIBLE : HIDDEN]}>
      <VideoView
        player={player}
        // Explicit size: on web a <video> keeps its intrinsic 720×1560 with only `inset: 0`.
        style={styles.fill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        playsInline
        onFirstFrameRender={() => setShown(true)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});

// Reanimated CSS transitions. Kept out of StyleSheet.create: react-native-web's validator rejects them.
const FADE = { transitionProperty: 'opacity', transitionDuration: 400, transitionTimingFunction: 'ease-out' } as const;
const HIDDEN = { ...FADE, opacity: 0 } as const;
const VISIBLE = { ...FADE, opacity: 1 } as const;
