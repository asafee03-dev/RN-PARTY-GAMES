import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AliasHomeScreen from '../screens/Alias/AliasHomeScreen';
import AliasSetupScreen from '../screens/Alias/AliasSetupScreen';
import AliasRoomScreen from '../screens/Alias/AliasRoomScreen';
import AliasGameScreen from '../screens/Alias/AliasGameScreen';
import AliasEndScreen from '../screens/Alias/AliasEndScreen';

const Stack = createNativeStackNavigator();

export default function AliasNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AliasHome" component={AliasHomeScreen} />
      <Stack.Screen name="AliasSetup" component={AliasSetupScreen} />
      <Stack.Screen name="AliasRoom" component={AliasRoomScreen} />
      <Stack.Screen name="AliasGame" component={AliasGameScreen} />
      <Stack.Screen name="AliasEnd" component={AliasEndScreen} />
    </Stack.Navigator>
  );
}

