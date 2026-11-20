import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CodenamesHomeScreen from '../screens/Codenames/CodenamesHomeScreen';
import CodenamesSetupScreen from '../screens/Codenames/CodenamesSetupScreen';
import CodenamesGameScreen from '../screens/Codenames/CodenamesGameScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function CodenamesNavigator() {
  return (
    <GameThemeProvider game="codenames">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CodenamesHome" component={CodenamesHomeScreen} />
        <Stack.Screen name="CodenamesSetup" component={CodenamesSetupScreen} />
        <Stack.Screen name="CodenamesGame" component={CodenamesGameScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

