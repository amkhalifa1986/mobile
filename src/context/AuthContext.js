import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../config/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token and fetch user on app start
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        if (token) {
          const userData = await api.get('/api/auth/me');
          setUser(userData);
        }
      } catch (e) {
        console.error('Failed to restore session', e);
        await logout();
      }
      setIsLoading(false);
    };

    bootstrapAsync();
  }, []);

  const login = async (email, password) => {
    try {
      const loginData = await api.post('/api/auth/login', {
        email,
        password,
        rememberMe: true,
      });

      const { accessToken, refreshToken } = loginData;
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);

      // Fetch profile
      const userData = await api.get('/api/auth/me');
      setUser(userData);
    } catch (e) {
      console.error('Login error', e);
      throw e;
    }
  };

  const register = async (displayName, email, password) => {
    try {
      await api.post('/api/auth/register', {
        displayName,
        email,
        password,
      });
      // Automatically log in after registration
      await login(email, password);
    } catch (e) {
      console.error('Registration error', e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
    } catch (e) {
      console.error('Logout error', e);
    }
    setUser(null);
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => prev ? { ...prev, ...updatedFields } : null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
