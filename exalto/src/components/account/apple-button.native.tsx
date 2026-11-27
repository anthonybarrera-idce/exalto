import { Platform, View } from 'react-native';

type AppleModule = typeof import('expo-apple-authentication');
let Apple: AppleModule | null = null;
try {
  if (Platform.OS === 'ios') Apple = require('expo-apple-authentication');
} catch {
  Apple = null; // Dev client built before Sign in with Apple was added.
}

/** Apple's own button, as App Review expects. Shown only when the welcome page found Apple sign-in available. */
export function AppleButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  if (!Apple) return null;
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.6 : 1 }}>
      <Apple.AppleAuthenticationButton
        buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={20}
        style={{ width: '100%', height: 44 }}
        onPress={onPress}
      />
    </View>
  );
}
