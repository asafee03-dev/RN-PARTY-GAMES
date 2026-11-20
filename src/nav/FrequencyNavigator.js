import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FrequencyHomeScreen from '../screens/Frequency/FrequencyHomeScreen';
import FrequencyRoomScreen from '../screens/Frequency/FrequencyRoomScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function FrequencyNavigator() {
  return (
    <GameThemeProvider game="frequency">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="FrequencyHome" component={FrequencyHomeScreen} />
        <Stack.Screen name="FrequencyRoom" component={FrequencyRoomScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

