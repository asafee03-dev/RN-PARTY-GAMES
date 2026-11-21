import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SpyHomeScreen from '../screens/Spy/SpyHomeScreen';
import SpyRoomScreen from '../screens/Spy/SpyRoomScreen';
import SpyLocalScreen from '../screens/Spy/local/SpyLocalScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function SpyNavigator() {
  return (
    <GameThemeProvider game="spy">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="SpyHome" component={SpyHomeScreen} />
        <Stack.Screen name="SpyRoom" component={SpyRoomScreen} />
        <Stack.Screen name="SpyLocal" component={SpyLocalScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

