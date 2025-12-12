import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import HomeNavigator from './HomeNavigator';
import AliasNavigator from './AliasNavigator';
import FrequencyNavigator from './FrequencyNavigator';
import CodenamesNavigator from './CodenamesNavigator';
import SpyNavigator from './SpyNavigator';
import DrawNavigator from './DrawNavigator';
import { loadNavigationState, saveNavigationState, loadCurrentRoom } from '../utils/navigationState';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState(undefined);
  const navigationRef = useRef(null);

  useEffect(() => {
    // Restore navigation state on app load
    const restoreState = async () => {
      try {
        const savedState = await loadNavigationState();
        if (savedState) {
          setInitialState(savedState);
        } else {
          // Fallback: try to restore from saved room info
          const savedRoom = await loadCurrentRoom();
          if (savedRoom && savedRoom.roomCode) {
            // Build navigation state from saved room
            const gameTypeCapitalized = savedRoom.gameType.charAt(0).toUpperCase() + savedRoom.gameType.slice(1);
            let screenName = `${gameTypeCapitalized}Room`;
            if (savedRoom.gameType === 'alias') {
              screenName = 'AliasSetup'; // Will auto-navigate to Game if needed
            } else if (savedRoom.gameType === 'codenames') {
              screenName = 'CodenamesSetup'; // Will auto-navigate to Game if needed
            }
            
            const restoredState = {
              index: 1,
              routes: [
                { name: 'Home', params: undefined },
                {
                  name: gameTypeCapitalized,
                  state: {
                    index: 1,
                    routes: [
                      { name: `${gameTypeCapitalized}Home`, params: undefined },
                      { name: screenName, params: { roomCode: savedRoom.roomCode } }
                    ]
                  }
                }
              ]
            };
            setInitialState(restoredState);
          }
        }
      } catch (error) {
        console.warn('⚠️ Error restoring navigation state:', error);
      } finally {
        setIsReady(true);
      }
    };

    restoreState();
  }, []);

  // Save navigation state whenever it changes
  const handleStateChange = (state) => {
    if (Platform.OS === 'web' && state) {
      // Save state to localStorage for web
      saveNavigationState(state);
      
      // Update URL for web (optional, for better UX)
      if (typeof window !== 'undefined' && navigationRef.current) {
        try {
          const currentRoute = navigationRef.current.getCurrentRoute();
          if (currentRoute) {
            const routeName = currentRoute.name;
            const params = currentRoute.params || {};
            
            // Build URL path based on route
            let path = '/';
            if (routeName === 'Home') {
              path = '/';
            } else if (params.roomCode) {
              // Determine game type from route name
              let gameType = '';
              if (routeName.includes('Frequency')) gameType = 'frequency';
              else if (routeName.includes('Draw')) gameType = 'draw';
              else if (routeName.includes('Spy')) gameType = 'spy';
              else if (routeName.includes('Alias')) gameType = 'alias';
              else if (routeName.includes('Codenames')) gameType = 'codenames';
              
              if (gameType) {
                // Room screens: /game/<gameType>/room/<roomCode>
                path = `/game/${gameType}/room/${params.roomCode}`;
              }
            } else if (routeName.includes('Home')) {
              // Game home screens: /game/<gameType>
              let gameType = '';
              if (routeName.includes('Frequency')) gameType = 'frequency';
              else if (routeName.includes('Draw')) gameType = 'draw';
              else if (routeName.includes('Spy')) gameType = 'spy';
              else if (routeName.includes('Alias')) gameType = 'alias';
              else if (routeName.includes('Codenames')) gameType = 'codenames';
              
              if (gameType) {
                path = `/game/${gameType}`;
              }
            }
            
            // Update URL without page reload
            if (window.location.pathname !== path) {
              window.history.replaceState({}, '', path);
            }
          }
        } catch (error) {
          // Silently fail if URL update fails
        }
      }
    }
  };

  if (!isReady) {
    // Return null or a loading screen while restoring state
    return null;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      initialState={initialState}
      onStateChange={handleStateChange}
      onReady={async () => {
        // Navigation is ready, ensure we're on the correct screen
        if (Platform.OS === 'web' && typeof window !== 'undefined' && navigationRef.current) {
          // Check if URL has room info and navigate if needed
          const path = window.location.pathname;
          // Support both /game/<gameType>/room/<roomCode> and /join/<gameType>/<roomCode>
          const roomMatch = path.match(/\/(?:game|join)\/(\w+)\/(?:room\/)?(\w+)/);
          if (roomMatch) {
            const [, gameType, roomCode] = roomMatch;
            const gameTypeCapitalized = gameType.charAt(0).toUpperCase() + gameType.slice(1);
            
            // Navigate to the room if not already there
            const currentRoute = navigationRef.current.getCurrentRoute();
            if (!currentRoute || currentRoute.params?.roomCode !== roomCode) {
              try {
                // Check if player has a saved name
                const storage = (await import('../utils/storage')).default;
                const playerName = await storage.getItem('playerName');
                
                if (playerName) {
                  // Player has a name - navigate directly to room
                  let screenName = `${gameTypeCapitalized}Room`;
                  if (gameType === 'alias') {
                    screenName = 'AliasSetup'; // Will auto-navigate to Game if needed
                  } else if (gameType === 'codenames') {
                    screenName = 'CodenamesSetup'; // Will auto-navigate to Game if needed
                  }
                  
                  navigationRef.current.navigate(gameTypeCapitalized, {
                    screen: screenName,
                    params: { roomCode }
                  });
                } else {
                  // No player name - navigate to home screen with pre-filled room code
                  navigationRef.current.navigate(gameTypeCapitalized, {
                    screen: `${gameTypeCapitalized}Home`,
                    params: { prefillRoomCode: roomCode }
                  });
                }
              } catch (error) {
                console.warn('⚠️ Error navigating from URL:', error);
              }
            }
          }
        }
      }}
    >
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

