import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { logAppOpen } from '../utils/analytics';
import { parseDeepLink } from '../utils/deepLinking';
import { clearNavigationState, saveNavigationState } from '../utils/navigationState';
import storage from '../utils/storage';
import AliasNavigator from './AliasNavigator';
import CodenamesNavigator from './CodenamesNavigator';
import DrawNavigator from './DrawNavigator';
import FrequencyNavigator from './FrequencyNavigator';
import HomeNavigator from './HomeNavigator';
import SpyNavigator from './SpyNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [isReady, setIsReady] = useState(false);
  const navigationRef = useRef(null);

  useEffect(() => {
    // Clear saved state on app initialization (cold start)
    // This ensures the app always starts from Home screen when fully closed and reopened
    const initializeApp = async () => {
      try {
        // Clear any saved navigation state and room state on cold start
        // This prevents restoring stale screens or deleted rooms
        await clearNavigationState();
        console.log('✅ Cleared saved navigation state on app initialization');
        
        // Log app_open event (only once per app session)
        logAppOpen();
      } catch (error) {
        console.warn('⚠️ Error clearing navigation state:', error);
      } finally {
        // Always set ready - app will start from Home (initialRouteName)
        setIsReady(true);
      }
    };

    initializeApp();
  }, []);

  // Navigate based on deep link
  // Handles both HTTPS Universal Links (https://party-games-app.com/join?...)
  // and custom scheme deep links (partygames://join?...)
  const handleDeepLink = useCallback(async (url) => {
    if (!navigationRef.current || !url) {
      return;
    }

    try {
      console.log('🔗 Handling deep link:', url);
      
      const parsed = parseDeepLink(url);
      if (!parsed) {
        console.log('⚠️ Invalid deep link format, ignoring:', url);
        return;
      }

      const { game, roomId, inviter } = parsed;
      console.log('✅ Parsed deep link:', { game, roomId, inviter });

      const gameTypeCapitalized = game.charAt(0).toUpperCase() + game.slice(1);

      // Check if player has a saved nickname
      const playerName = await storage.getItem('playerName');

      if (playerName) {
        // Player has nickname - auto-join and navigate directly to room
        let screenName = `${gameTypeCapitalized}Room`;
        if (game === 'alias') {
          screenName = 'AliasSetup';
        } else if (game === 'codenames') {
          screenName = 'CodenamesSetup';
        }

        console.log(`🚀 Navigating to ${gameTypeCapitalized} -> ${screenName} with roomCode: ${roomId}`);
        navigationRef.current.navigate(gameTypeCapitalized, {
          screen: screenName,
          params: { roomCode: roomId, fromDeepLink: true }
        });
      } else {
        // No nickname - navigate to home screen with pre-filled room code
        console.log(`🚀 Navigating to ${gameTypeCapitalized}Home with prefillRoomCode: ${roomId}`);
        navigationRef.current.navigate(gameTypeCapitalized, {
          screen: `${gameTypeCapitalized}Home`,
          params: { prefillRoomCode: roomId, inviter }
        });
      }
    } catch (error) {
      console.warn('⚠️ Error handling deep link:', error);
    }
  }, []);

  // Handle deep links - both cold start and warm start
  useEffect(() => {
    if (!isReady) {
      return;
    }

    let subscription = null;

    // Wait a bit for navigation to be ready
    const timeoutId = setTimeout(() => {
      if (!navigationRef.current) {
        console.warn('⚠️ Navigation ref not ready for deep link handling');
        return;
      }

      // Handle initial URL (cold start - when app opens from a link)
      const handleInitialURL = async () => {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            console.log('🔗 Cold start - initial URL:', initialUrl);
            handleDeepLink(initialUrl);
          }
        } catch (error) {
          console.warn('⚠️ Error getting initial URL:', error);
        }
      };

      // Handle URL changes (warm start - when app is already open)
      subscription = Linking.addEventListener('url', ({ url }) => {
        console.log('🔗 Warm start - URL event:', url);
        handleDeepLink(url);
      });

      // Check for initial URL
      handleInitialURL();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (subscription) {
        subscription.remove();
      }
    };
  }, [isReady, handleDeepLink]);

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

  // Show NavigationContainer immediately - don't block on state restoration
  // This prevents white screen on app launch
  // State is cleared on initialization, so app always starts from Home

  return (
    <NavigationContainer
      ref={navigationRef}
      initialState={undefined}
      onStateChange={handleStateChange}
      onReady={async () => {
        // Navigation is ready, ensure we're on the correct screen
        // Handle deep links for both web and native platforms
        if (navigationRef.current) {
          let roomCode = null;
          let gameType = null;
          
          // Check URL for web platform
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const path = window.location.pathname;
            // Support both /game/<gameType>/room/<roomCode> and /join/<gameType>/<roomCode>
            const roomMatch = path.match(/\/(?:game|join)\/(\w+)\/(?:room\/)?(\w+)/);
            if (roomMatch) {
              [, gameType, roomCode] = roomMatch;
            }
          }
          
          // Also check for deep link params (for native platforms)
          // This would be set by the deep linking handler
          
          if (roomCode && gameType) {
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

