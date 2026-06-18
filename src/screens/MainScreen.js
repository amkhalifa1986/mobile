import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TabBar from '../components/TabBar';
import DashboardScreen from './DashboardScreen';
import SearchScreen from './SearchScreen';
import ProfileScreen from './ProfileScreen';
import SuggestionsScreen from './SuggestionsScreen';
import LostFoundScreen from './LostFoundScreen';

export default function MainScreen({ navigation }) {
  const [currentTab, setCurrentTab] = useState('home');

  const renderActiveScreen = () => {
    switch (currentTab) {
      case 'home':
        return <DashboardScreen navigation={navigation} />;
      case 'search':
        return <SearchScreen navigation={navigation} />;
      case 'lostfound':
        return <LostFoundScreen navigation={navigation} />;
      case 'suggestions':
        return <SuggestionsScreen navigation={navigation} />;
      case 'profile':
        return <ProfileScreen navigation={navigation} />;
      default:
        return <DashboardScreen navigation={navigation} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {renderActiveScreen()}
      </View>
      <TabBar currentTab={currentTab} setCurrentTab={setCurrentTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
  },
});
