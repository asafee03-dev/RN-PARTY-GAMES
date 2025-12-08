import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CodenamesHomeScreen from '../screens/Codenames/CodenamesHomeScreen';
import CodenamesSetupScreen from '../screens/Codenames/CodenamesSetupScreen';
import CodenamesRoomScreen from '../screens/Codenames/CodenamesRoomScreen';
import CodenamesGameScreen from '../screens/Codenames/CodenamesGameScreen';
import CodenamesEndScreen from '../screens/Codenames/CodenamesEndScreen';

const Stack = createNativeStackNavigator();

export default function CodenamesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CodenamesHome" component={CodenamesHomeScreen} />
      <Stack.Screen name="CodenamesSetup" component={CodenamesSetupScreen} />
      <Stack.Screen name="CodenamesRoom" component={CodenamesRoomScreen} />
      <Stack.Screen name="CodenamesGame" component={CodenamesGameScreen} />
      <Stack.Screen name="CodenamesEnd" component={CodenamesEndScreen} />
    </Stack.Navigator>
  );
}

