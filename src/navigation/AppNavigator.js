import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthContext } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import MainScreen from '../screens/MainScreen';
import TripDetailsScreen from '../screens/TripDetailsScreen';
import TrainDetailsScreen from '../screens/TrainDetailsScreen';
import SuggestionsScreen from '../screens/SuggestionsScreen';
import LostFoundScreen from '../screens/LostFoundScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return null; // Let the bootstrap loading finish
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ 
        headerStyle: { backgroundColor: '#0a0a0f' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' }
      }}>
        {user == null ? (
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="Register" 
              component={RegisterScreen} 
              options={{ headerShown: false }} 
            />
          </>
        ) : (
          <>
            <Stack.Screen 
              name="Main" 
              component={MainScreen} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="TripDetails" 
              component={TripDetailsScreen} 
              options={{ title: 'Trip Tracking' }} 
            />
            <Stack.Screen 
              name="TrainDetails" 
              component={TrainDetailsScreen} 
              options={{ title: 'Train Timetable' }} 
            />
            <Stack.Screen 
              name="Suggestions" 
              component={SuggestionsScreen} 
              options={{ title: 'Suggestions' }} 
            />
            <Stack.Screen 
              name="LostFound" 
              component={LostFoundScreen} 
              options={{ title: 'Lost & Found' }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

