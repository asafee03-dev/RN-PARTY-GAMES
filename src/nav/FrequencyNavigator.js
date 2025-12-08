import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FrequencyHomeScreen from '../screens/Frequency/FrequencyHomeScreen';
import FrequencyRoomScreen from '../screens/Frequency/FrequencyRoomScreen';

const Stack = createNativeStackNavigator();

export default function FrequencyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FrequencyHome" component={FrequencyHomeScreen} />
      <Stack.Screen name="FrequencyRoom" component={FrequencyRoomScreen} />
    </Stack.Navigator>
  );
}

