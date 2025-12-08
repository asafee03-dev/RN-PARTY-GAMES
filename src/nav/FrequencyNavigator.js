import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FrequencyHomeScreen from '../screens/Frequency/FrequencyHomeScreen';
import FrequencySetupScreen from '../screens/Frequency/FrequencySetupScreen';
import FrequencyRoomScreen from '../screens/Frequency/FrequencyRoomScreen';
import FrequencyGameScreen from '../screens/Frequency/FrequencyGameScreen';
import FrequencyEndScreen from '../screens/Frequency/FrequencyEndScreen';

const Stack = createNativeStackNavigator();

export default function FrequencyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FrequencyHome" component={FrequencyHomeScreen} />
      <Stack.Screen name="FrequencySetup" component={FrequencySetupScreen} />
      <Stack.Screen name="FrequencyRoom" component={FrequencyRoomScreen} />
      <Stack.Screen name="FrequencyGame" component={FrequencyGameScreen} />
      <Stack.Screen name="FrequencyEnd" component={FrequencyEndScreen} />
    </Stack.Navigator>
  );
}

