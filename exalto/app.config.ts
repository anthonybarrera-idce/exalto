import type { ExpoConfig } from 'expo/config';

/**
 * Extends app.json. Google sign-in's native plugin needs the iOS URL scheme (the reversed iOS OAuth client ID,
 * `com.googleusercontent.apps.…`). It's added only when EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set, so builds keep
 * working before the Google client exists; without it the app simply hides the Google button.
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    : undefined;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, object]] : []),
    ],
  };
};
