import React, { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/nav/AppNavigator';
import { iconFont } from './src/ui/Icon';
import { RTLRoot } from './src/setup/rtl';

// Keep the native splash visible until fonts are ready, so text never
// flashes in the system font first.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Temporary dev-only design system preview: open the web app with ?design
// (removed at the end of the redesign).
const showDesignPreview =
  __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined' && window.location.search.includes('design');

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Rubik-Regular': require('./assets/fonts/Rubik-Regular.ttf'),
    'Rubik-Medium': require('./assets/fonts/Rubik-Medium.ttf'),
    'Rubik-Bold': require('./assets/fonts/Rubik-Bold.ttf'),
    ...iconFont,
  });

  const ready = fontsLoaded || !!fontError; // On a font error, continue with system fonts rather than hang

  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontError) console.warn('⚠️ Font loading failed, using system font:', fontError);
    if (ready) hideSplash();
  }, [ready, fontError, hideSplash]);

  if (!ready) {
    return null; // Splash screen is still showing
  }

  if (showDesignPreview) {
    const DesignPreviewScreen = require('./src/screens/dev/DesignPreviewScreen').default;
    return (
      <RTLRoot>
        <SafeAreaProvider>
          <DesignPreviewScreen />
        </SafeAreaProvider>
      </RTLRoot>
    );
  }

  return (
    <RTLRoot>
      <AppNavigator />
    </RTLRoot>
  );
}
