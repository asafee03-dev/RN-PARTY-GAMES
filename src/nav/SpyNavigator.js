import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SpyHomeScreen from '../screens/Spy/SpyHomeScreen';
import SpySetupScreen from '../screens/Spy/SpySetupScreen';
import SpyRoomScreen from '../screens/Spy/SpyRoomScreen';
import SpyGameScreen from '../screens/Spy/SpyGameScreen';
import SpyEndScreen from '../screens/Spy/SpyEndScreen';

const Stack = createNativeStackNavigator();

export default function SpyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SpyHome" component={SpyHomeScreen} />
      <Stack.Screen name="SpySetup" component={SpySetupScreen} />
      <Stack.Screen name="SpyRoom" component={SpyRoomScreen} />
      <Stack.Screen name="SpyGame" component={SpyGameScreen} />
      <Stack.Screen name="SpyEnd" component={SpyEndScreen} />
    </Stack.Navigator>
  );
}

