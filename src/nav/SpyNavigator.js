import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SpyHomeScreen from '../screens/Spy/SpyHomeScreen';
import SpyRoomScreen from '../screens/Spy/SpyRoomScreen';

const Stack = createNativeStackNavigator();

export default function SpyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SpyHome" component={SpyHomeScreen} />
      <Stack.Screen name="SpyRoom" component={SpyRoomScreen} />
    </Stack.Navigator>
  );
}

