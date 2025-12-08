import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DrawHomeScreen from '../screens/Draw/DrawHomeScreen';
import DrawSetupScreen from '../screens/Draw/DrawSetupScreen';
import DrawRoomScreen from '../screens/Draw/DrawRoomScreen';
import DrawGameScreen from '../screens/Draw/DrawGameScreen';
import DrawEndScreen from '../screens/Draw/DrawEndScreen';

const Stack = createNativeStackNavigator();

export default function DrawNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DrawHome" component={DrawHomeScreen} />
      <Stack.Screen name="DrawSetup" component={DrawSetupScreen} />
      <Stack.Screen name="DrawRoom" component={DrawRoomScreen} />
      <Stack.Screen name="DrawGame" component={DrawGameScreen} />
      <Stack.Screen name="DrawEnd" component={DrawEndScreen} />
    </Stack.Navigator>
  );
}

