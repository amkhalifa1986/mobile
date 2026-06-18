import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';

export default function TabBar({ currentTab, setCurrentTab }) {
  const { t, isRTL } = useLanguage();

  const tabs = [
    { id: 'home', label: t('home'), icon: 'home-outline', iconActive: 'home' },
    { id: 'search', label: t('Search'), icon: 'search-outline', iconActive: 'search' },
    { id: 'lostfound', label: t('lostFound'), icon: 'archive-outline', iconActive: 'archive' },
    { id: 'suggestions', label: t('suggestions'), icon: 'bulb-outline', iconActive: 'bulb' },
    { id: 'profile', label: t('profile'), icon: 'person-outline', iconActive: 'person' },
  ];

  return (
    <View style={[styles.container, isRTL && styles.rowRTL]}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            activeOpacity={0.7}
            onPress={() => setCurrentTab(tab.id)}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={24}
              color={isActive ? '#6366f1' : '#94a3b8'}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#0a0a0f',
    borderTopWidth: 1,
    borderTopColor: '#1e1e2d',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    fontWeight: '500',
  },
  labelActive: {
    color: '#6366f1',
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 24,
    height: 3,
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
});
