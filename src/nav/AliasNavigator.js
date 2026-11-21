import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AliasHomeScreen from '../screens/Alias/AliasHomeScreen';
import AliasSetupScreen from '../screens/Alias/AliasSetupScreen';
import AliasGameScreen from '../screens/Alias/AliasGameScreen';
import AliasLocalSetupScreen from '../screens/Alias/local/AliasLocalSetupScreen';
import AliasLocalGameScreen from '../screens/Alias/local/AliasLocalGameScreen';
import { GameThemeProvider } from '../theme';

const Stack = createNativeStackNavigator();

export default function AliasNavigator() {
  return (
    <GameThemeProvider game="alias">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AliasHome" component={AliasHomeScreen} />
        <Stack.Screen name="AliasSetup" component={AliasSetupScreen} />
        <Stack.Screen name="AliasGame" component={AliasGameScreen} />
        <Stack.Screen name="AliasLocalSetup" component={AliasLocalSetupScreen} />
        <Stack.Screen name="AliasLocalGame" component={AliasLocalGameScreen} />
      </Stack.Navigator>
    </GameThemeProvider>
  );
}

