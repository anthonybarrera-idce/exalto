import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { PlayerModal } from "@/components/player/PlayerModal";
import { AudioProvider } from "@/context/audio-context";
import { FavoritesProvider } from "@/context/favorites-context";
import { HymnsProvider } from "@/context/hymns-context";
import { ViewModeProvider } from "@/context/view-mode-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Keep the splash up briefly until fonts are ready; fall back to system fonts on error.
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <HymnsProvider>
        <FavoritesProvider>
          <ViewModeProvider>
            <AudioProvider>
              <AnimatedSplashOverlay />
              <AppTabs />
              <PlayerModal />
            </AudioProvider>
          </ViewModeProvider>
        </FavoritesProvider>
        </HymnsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
