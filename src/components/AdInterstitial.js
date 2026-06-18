import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useAds } from '../context/AdContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

/**
 * AdInterstitial — shows a full-screen ad modal once per unique page instance.
 *
 * Props:
 *   pageKey    {string}  - admin-configured page key (e.g. 'tripDetails')
 *   instanceId {string}  - unique ID for detail pages (e.g. trip.id). Omit for single-instance pages.
 */
export default function AdInterstitial({ pageKey, instanceId = null }) {
  const { shouldShowAd, markAdShown } = useAds();
  const { t, isRTL } = useLanguage();
  const { theme, isDarkMode } = useTheme();

  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Decide once when the component mounts (or when the instance changes)
  useEffect(() => {
    if (shouldShowAd(pageKey, instanceId)) {
      setVisible(true);
      setCountdown(5);
      // Entrance animation
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, instanceId]);

  // Countdown timer
  useEffect(() => {
    if (!visible) return;
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, countdown]);

  const handleClose = async () => {
    if (countdown > 0) return;
    setVisible(false);
    await markAdShown(pageKey, instanceId);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { /* prevent hardware back — user must wait */ }}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Header row */}
          <View style={[styles.header, isRTL && styles.rowRTL]}>
            <View style={styles.sponsoredBadge}>
              <Text style={styles.sponsoredText}>
                {isRTL ? 'إعلان مدفوع' : 'Sponsored'}
              </Text>
            </View>
            {countdown > 0 ? (
              <View style={styles.countdownBadge}>
                <Text style={[styles.countdownText, { color: theme.textSecondary }]}>
                  {isRTL ? `أغلق خلال ${countdown}` : `Close in ${countdown}`}
                </Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mock ad content — replace with real ad SDK in production */}
          <View style={[styles.adContent, { borderColor: isDarkMode ? '#334155' : '#e2e8f0' }]}>
            <Text style={[styles.adTitle, { color: theme.text }]}>
              {isRTL ? 'اشترك في WITT Premium' : 'Go WITT Premium'}
            </Text>
            <Text style={[styles.adBody, { color: theme.textSecondary }]}>
              {isRTL
                ? 'استمتع بتجربة خالية من الإعلانات، ومتابعة رحلات غير محدودة، وتنبيهات فورية.'
                : 'Enjoy an ad-free experience, unlimited trip tracking, and instant arrival alerts.'}
            </Text>
            <View style={styles.adCtaRow}>
              <Text style={styles.adCtaText}>
                {isRTL ? 'اعرف أكثر ←' : '→ Learn More'}
              </Text>
            </View>
            <Text style={styles.devNote}>Development Fallback Ad</Text>
          </View>

          {/* Close / continue button */}
          <TouchableOpacity
            style={[
              styles.continueBtn,
              countdown > 0 && styles.continueBtnDisabled,
            ]}
            onPress={handleClose}
            disabled={countdown > 0}
            activeOpacity={0.8}
          >
            <Text style={[styles.continueBtnText, countdown > 0 && { color: theme.textSecondary }]}>
              {countdown > 0
                ? (isRTL ? `انتظر ${countdown} ثانية` : `Wait ${countdown}s`)
                : (isRTL ? 'إغلاق ومتابعة' : 'Close & Continue')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  rowRTL: { flexDirection: 'row-reverse' },
  sponsoredBadge: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sponsoredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownBadge: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countdownText: { fontSize: 12, fontWeight: '600' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  adContent: {
    borderWidth: 1,
    borderRadius: 16,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 180,
    justifyContent: 'center',
  },
  adTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  adBody: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  adCtaRow: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  adCtaText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  devNote: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 12,
  },
  continueBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  continueBtnDisabled: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
