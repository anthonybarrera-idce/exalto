import { NativeTabs } from "expo-router/unstable-native-tabs";

import { AppBackground } from "@/constants/theme";

const ACTIVE_TINT = "#FFFFFF";
const INACTIVE_TINT = "#55504A";

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={AppBackground}
      indicatorColor="transparent"
      labelStyle={{
        default: { color: INACTIVE_TINT },
        selected: { color: ACTIVE_TINT },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          // sf={{ default: "house", selected: "house.fill" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="hymns">
        <NativeTabs.Trigger.Icon
          sf={{ default: "music.note.list", selected: "music.note.list" }}
          src={require("@/assets/images/tabIcons/home.png")}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
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
