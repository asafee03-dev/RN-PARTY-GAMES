import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeNavigator from './HomeNavigator';
import AliasNavigator from './AliasNavigator';
import FrequencyNavigator from './FrequencyNavigator';
import CodenamesNavigator from './CodenamesNavigator';
import SpyNavigator from './SpyNavigator';
import DrawNavigator from './DrawNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home" component={HomeNavigator} />
        <Stack.Screen name="Alias" component={AliasNavigator} />
        <Stack.Screen name="Frequency" component={FrequencyNavigator} />
        <Stack.Screen name="Codenames" component={CodenamesNavigator} />
        <Stack.Screen name="Spy" component={SpyNavigator} />
        <Stack.Screen name="Draw" component={DrawNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

