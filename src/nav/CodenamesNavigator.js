import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CodenamesHomeScreen from '../screens/Codenames/CodenamesHomeScreen';
import CodenamesSetupScreen from '../screens/Codenames/CodenamesSetupScreen';
import CodenamesGameScreen from '../screens/Codenames/CodenamesGameScreen';

const Stack = createNativeStackNavigator();

export default function CodenamesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CodenamesHome" component={CodenamesHomeScreen} />
      <Stack.Screen name="CodenamesSetup" component={CodenamesSetupScreen} />
      <Stack.Screen name="CodenamesGame" component={CodenamesGameScreen} />
    </Stack.Navigator>
  );
}

