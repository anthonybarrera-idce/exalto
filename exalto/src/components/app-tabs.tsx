import { NativeTabs } from "expo-router/unstable-native-tabs";

import { AppBackground } from "@/constants/theme";
import { useLocale } from "@/context/locale-context";

const ACTIVE_TINT = "#04C1FF"; // Figma: cyan when selected
const INACTIVE_TINT = "#F5C080"; // amber otherwise

export default function AppTabs() {
  const { t } = useLocale();
  return (
    <NativeTabs
      backgroundColor={AppBackground}
      tintColor={ACTIVE_TINT}
      iconColor={{ default: INACTIVE_TINT, selected: ACTIVE_TINT }}
      indicatorColor="transparent"
      labelStyle={{
        default: { color: INACTIVE_TINT },
        selected: { color: ACTIVE_TINT },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("tabs.home")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="hymns">
        <NativeTabs.Trigger.Label>{t("tabs.hymns")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "book", selected: "book" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Label>{t("tabs.discover")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "safari", selected: "safari" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>{t("tabs.library")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "music.note.list", selected: "music.note.list" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.circle', selected: 'person.circle.fill' }}
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger> */}
    </NativeTabs>
  );
}
