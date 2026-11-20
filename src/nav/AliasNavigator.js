import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AliasHomeScreen from '../screens/Alias/AliasHomeScreen';
import AliasSetupScreen from '../screens/Alias/AliasSetupScreen';
import AliasGameScreen from '../screens/Alias/AliasGameScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function AliasNavigator() {
  return (
    <GameThemeProvider game="alias">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AliasHome" component={AliasHomeScreen} />
        <Stack.Screen name="AliasSetup" component={AliasSetupScreen} />
        <Stack.Screen name="AliasGame" component={AliasGameScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

