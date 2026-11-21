import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DrawHomeScreen from '../screens/Draw/DrawHomeScreen';
import DrawRoomScreen from '../screens/Draw/DrawRoomScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function DrawNavigator() {
  return (
    <GameThemeProvider game="draw">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DrawHome" component={DrawHomeScreen} />
        <Stack.Screen name="DrawRoom" component={DrawRoomScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

