import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../config/api';

const AdContext = createContext(null);

// SecureStore key that stores JSON array of seen ad instance keys
const SEEN_ADS_KEY = 'witt_seen_ads';

const getSeenAds = async () => {
  try {
    const raw = await SecureStore.getItemAsync(SEEN_ADS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const saveSeenAds = async (set) => {
  try {
    await SecureStore.setItemAsync(SEEN_ADS_KEY, JSON.stringify([...set]));
  } catch { /* storage full — ignore */ }
};

/**
 * Build the composite key used for deduplication.
 * - Single-instance pages (dashboard, search …): key = pageKey
 * - Detail pages (trip, train …): key = "pageKey:instanceId"
 */
const buildKey = (pageKey, instanceId) =>
  instanceId ? `${pageKey}:${instanceId}` : pageKey;

export const AdProvider = ({ children }) => {
  const [adsConfig, setAdsConfig] = useState({});
  const [loading, setLoading] = useState(true);
  // Local cache of seen ads so we don't hit SecureStore on every render
  const [seenAds, setSeenAds] = useState(new Set());

  useEffect(() => {
    // Load admin ad config
    const fetchAdSettings = async () => {
      try {
        const response = await api.get('/api/ads/settings');
        const data = response?.data ?? response;
        if (data && typeof data === 'object') {
          setAdsConfig(data);
        }
      } catch (err) {
        console.error('Failed to load ad settings:', err);
      } finally {
        setLoading(false);
      }
    };

    // Load already-seen ads from persistent storage
    const loadSeenAds = async () => {
      const seen = await getSeenAds();
      setSeenAds(seen);
    };

    fetchAdSettings();
    loadSeenAds();
  }, []);

  /**
   * Returns true if the ad should be shown for this specific page instance.
   * @param {string} pageKey    - admin-configured page identifier (e.g. 'tripDetails')
   * @param {string} instanceId - unique ID of the specific item (e.g. trip.id). Omit for single-instance pages.
   */
  const shouldShowAd = (pageKey, instanceId = null) => {
    if (loading) return false;
    if (!adsConfig[pageKey]) return false;
    return !seenAds.has(buildKey(pageKey, instanceId));
  };

  /**
   * Marks the ad for this page instance as seen (persisted to SecureStore).
   */
  const markAdShown = async (pageKey, instanceId = null) => {
    const key = buildKey(pageKey, instanceId);
    const updated = new Set(seenAds);
    updated.add(key);
    setSeenAds(updated);
    await saveSeenAds(updated);
  };

  return (
    <AdContext.Provider value={{ adsConfig, loading, shouldShowAd, markAdShown }}>
      {children}
    </AdContext.Provider>
  );
};

export const useAds = () => {
  const context = useContext(AdContext);
  if (!context) throw new Error('useAds must be used within an AdProvider');
  return context;
};
