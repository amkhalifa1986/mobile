import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';

const ThemeContext = createContext();

export const themes = {
  dark: {
    background: '#0a0a0f',
    cardBackground: '#12121a',
    text: '#ffffff',
    textSecondary: '#64748b',
    border: '#1e1e2d',
    primary: '#6366f1',
    successBg: '#10b98120',
    successText: '#10b981',
    warningBg: '#f59e0b15',
    warningBorder: '#f59e0b40',
    warningText: '#f59e0b',
    errorBg: '#fca5a510',
    errorBorder: '#f87171',
    errorText: '#f87171',
    inputBg: '#0a0a0f',
    inputText: '#ffffff',
    inputPlaceholder: '#475569',
    buttonDisabled: '#334155',
    tabBarBg: '#12121a',
    tabBarBorder: '#1e1e2d',
  },
  light: {
    background: '#f8fafc',
    cardBackground: '#ffffff',
    text: '#0f172a',
    textSecondary: '#475569',
    border: '#e2e8f0',
    primary: '#4f46e5',
    successBg: '#d1fae5',
    successText: '#065f46',
    warningBg: '#fef3c7',
    warningBorder: '#fde68a',
    warningText: '#b45309',
    errorBg: '#fee2e2',
    errorBorder: '#fca5a5',
    errorText: '#991b1b',
    inputBg: '#f1f5f9',
    inputText: '#0f172a',
    inputPlaceholder: '#94a3b8',
    buttonDisabled: '#cbd5e1',
    tabBarBg: '#ffffff',
    tabBarBorder: '#e2e8f0',
  }
};

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    async function loadTheme() {
      try {
        const storedTheme = await SecureStore.getItemAsync('app_theme');
        if (storedTheme) {
          setIsDarkMode(storedTheme === 'dark');
        }
      } catch (e) {
        console.error('Failed to load theme', e);
      }
    }
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    try {
      const nextTheme = !isDarkMode;
      setIsDarkMode(nextTheme);
      await SecureStore.setItemAsync('app_theme', nextTheme ? 'dark' : 'light');
    } catch (e) {
      console.error('Failed to save theme', e);
    }
  };

  const theme = isDarkMode ? themes.dark : themes.light;

  return (
    <ThemeContext.Provider value={{ isDarkMode, theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
