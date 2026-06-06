import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { PlayerModal } from "@/components/player/PlayerModal";
import { AudioProvider } from "@/context/audio-context";
import { ViewModeProvider } from "@/context/view-mode-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <ViewModeProvider>
          <AudioProvider>
            <AnimatedSplashOverlay />
            <AppTabs />
            <PlayerModal />
          </AudioProvider>
        </ViewModeProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
