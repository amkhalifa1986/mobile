import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import api from '../config/api';
import signalrService from '../services/signalrService';
import { Ionicons } from '@expo/vector-icons';
import AdInterstitial from '../components/AdInterstitial';

export default function DashboardScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { t, isRTL } = useLanguage();
  const { theme } = useTheme();

  const [stats, setStats] = useState(null);
  const [followedTrips, setFollowedTrips] = useState([]);
  const [todayTrips, setTodayTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 'all' = today's trips, 'followed' = filter to followed only
  const [tripFilter, setTripFilter] = useState('all');

  const fetchDashboardData = async () => {
    try {
      setError('');
      const [statsRes, followedRes, todayRes] = await Promise.all([
        api.get('/api/dashboard'),
        api.get('/api/trips/followed'),
        api.get('/api/trips/today')
      ]);
      setStats(statsRes);
      setFollowedTrips(followedRes || []);
      // Sort by scheduledDeparture (first stop) ascending so earliest trips appear first
      const sorted = (todayRes || []).slice().sort((a, b) => {
        const ta = a.scheduledDeparture || '99:99:99';
        const tb = b.scheduledDeparture || '99:99:99';
        return ta.localeCompare(tb);
      });
      setTodayTrips(sorted);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
      setError(isRTL ? 'فشل تحميل بيانات الصفحة الرئيسية. حاول مرة أخرى.' : 'Failed to load home page data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const initSignalR = async () => {
      try { await signalrService.connect(); } catch (err) { console.error('SignalR init failed', err); }
    };
    initSignalR();

    const unsubscribe = signalrService.registerListener((update) => {
      setStats((prevStats) => {
        if (!prevStats) return null;
        if (prevStats.recentUpdates?.some((u) => u.id === update.id)) return prevStats;
        return {
          ...prevStats,
          totalLiveUpdatesToday: (prevStats.totalLiveUpdatesToday || 0) + 1,
          recentUpdates: [update, ...(prevStats.recentUpdates || [])].slice(0, 10),
        };
      });
    });
    return () => { unsubscribe(); };
  }, []);



  // Compute filtered trips: always today's trips, optionally filtered to followed train IDs
  const followedTrainIds = new Set(followedTrips.map(ft => ft.trainId || ft.id));
  const displayedTrips = tripFilter === 'followed'
    ? todayTrips.filter(trip => followedTrainIds.has(trip.trainId) || followedTrainIds.has(trip.id))
    : todayTrips;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <AdInterstitial pageKey="dashboard" />
      {/* ── Welcome Row ── */}
      <View style={[styles.navbar, isRTL && styles.rowRTL]}>
        <View style={[styles.userInfo, isRTL && styles.rowRTL]}>
          <Text style={[styles.welcomeText, { color: theme.textSecondary }]}>{t('welcome')}, </Text>
          <Text style={[styles.userName, { color: theme.text }]}>{user?.displayName || 'User'}</Text>
        </View>
      </View>

      {/* ── Error Banner ── */}
      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: '#fca5a510', borderColor: '#f87171' }]}>
          <Text style={[styles.errorText, { color: '#f87171' }, isRTL && styles.textRTL]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchDashboardData}>
            <Text style={styles.retryText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Stats Strip ── */}
      {stats ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsContainer}
          contentContainerStyle={[styles.statsContent, isRTL && { flexDirection: 'row-reverse' }]}
        >
          <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="people-outline" size={22} color="#6366f1" />
            <Text style={[styles.statNumber, { color: theme.text }]}>{stats.totalUsers ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{isRTL ? 'مستخدمين' : 'Users'}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="train-outline" size={22} color="#10b981" />
            <Text style={[styles.statNumber, { color: theme.text }]}>{stats.totalTrains ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('trains')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="play-circle-outline" size={22} color="#f59e0b" />
            <Text style={[styles.statNumber, { color: theme.text }]}>
              {(stats.pendingTripsToday ?? 0) + (stats.runningTripsToday ?? 0)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('todayTrips')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name="chatbox-ellipses-outline" size={22} color="#a855f7" />
            <Text style={[styles.statNumber, { color: theme.text }]}>{stats.totalLiveUpdatesToday ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('liveFeed')}</Text>
          </View>
        </ScrollView>
      ) : null}

      {/* ── Trips Section Header + Toggle Filter ── */}
      <View style={[styles.tripsHeader, isRTL && styles.rowRTL]}>
        <View style={[styles.tripsHeaderLeft, isRTL && styles.rowRTL]}>
          <Ionicons name="pulse-outline" size={20} color="#10b981" />
          <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
            {t('todayTrips')}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{todayTrips.length}</Text>
          </View>
        </View>

        {/* Pill Toggle */}
        <View style={[styles.pillToggle, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.pillBtn, tripFilter === 'all' && styles.pillBtnActive]}
            onPress={() => setTripFilter('all')}
          >
            <Text style={[styles.pillBtnText, tripFilter === 'all' && styles.pillBtnTextActive]}>
              {isRTL ? 'الكل' : 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pillBtn, tripFilter === 'followed' && styles.pillBtnActive]}
            onPress={() => setTripFilter('followed')}
          >
            <Ionicons
              name="bookmark-outline"
              size={12}
              color={tripFilter === 'followed' ? '#fff' : '#94a3b8'}
              style={{ marginRight: isRTL ? 0 : 4, marginLeft: isRTL ? 4 : 0 }}
            />
            <Text style={[styles.pillBtnText, tripFilter === 'followed' && styles.pillBtnTextActive]}>
              {isRTL ? 'متابَعة' : 'Followed'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Trips List ── */}
      {displayedTrips.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Ionicons name="train-outline" size={36} color="#334155" style={{ marginBottom: 10 }} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {tripFilter === 'followed'
              ? (isRTL ? 'لا توجد رحلات اليوم لقطاراتك المتابَعة.' : 'No followed trains running today.')
              : t('noActiveTrips')}
          </Text>
        </View>
      ) : (
        <View style={[styles.listContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          {displayedTrips.map((trip, idx) => {
            const isFollowed = followedTrainIds.has(trip.trainId) || followedTrainIds.has(trip.id);
            const badgeColor = trip.statusDetails?.color || '#94a3b8';
            const badgeBg = trip.statusDetails?.color ? `${trip.statusDetails.color}20` : '#1e1e2d';
            const badgeBorder = trip.statusDetails?.color ? `${trip.statusDetails.color}40` : '#334155';
            const localizedStatus = isRTL 
              ? (trip.statusDetails?.nameAr || trip.status) 
              : (trip.statusDetails?.nameEn || trip.status);

            return (
              <TouchableOpacity
                key={trip.id}
                style={[
                  styles.tripItem,
                  { borderBottomColor: theme.border },
                  isRTL && styles.rowRTL,
                  idx === displayedTrips.length - 1 && { borderBottomWidth: 0 }
                ]}
                onPress={() => navigation.navigate('TripDetails', { id: trip.id })}
                activeOpacity={0.75}
              >
                {/* Followed corner dot indicator */}
                {isFollowed && (
                  <View
                    style={[
                      styles.followedDot,
                      isRTL
                        ? { right: 0, left: undefined, borderBottomLeftRadius: 18, borderBottomRightRadius: 0 }
                        : { left: 0, right: undefined, borderBottomRightRadius: 18, borderBottomLeftRadius: 0 },
                    ]}
                  />
                )}
                {/* Left: Number badge + meta */}
                <View style={[styles.tripLeft, isRTL && styles.rowRTL]}>
                  <View style={[styles.trainNumberBadge, { backgroundColor: '#10b98120' }]}>
                    <Text style={[styles.trainNumberText, { color: '#10b981' }]}>{trip.trainNumber}</Text>
                  </View>
                  <View style={[styles.tripMeta, { marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}>
                    <Text style={[styles.trainName, { color: theme.text }, isRTL && styles.textRTL]} numberOfLines={1}>
                      {isRTL ? trip.trainNameAr : trip.trainNameEn}
                    </Text>
                    <Text style={[styles.trainSub, { color: theme.textSecondary }, isRTL && styles.textRTL]}>
                      {trip.tripDate}
                    </Text>
                  </View>
                </View>
                {/* Right: Status badge + chevron */}
                <View style={[styles.statusContainer, isRTL && styles.rowRTL]}>
                  <View style={[styles.statusBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                    <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{localizedStatus}</Text>
                  </View>
                  <Ionicons
                    name={isRTL ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color="#475569"
                    style={{ marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Live Feed Section ── */}
      <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
        <Ionicons name="chatbubbles-outline" size={20} color="#a855f7" />
        <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
          {t('liveFeed')}
        </Text>
      </View>

      {!stats || !stats.recentUpdates || stats.recentUpdates.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={36} color="#334155" style={{ marginBottom: 10 }} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noUpdatesFeed')}</Text>
        </View>
      ) : (
        <View style={styles.feedContainer}>
          {stats.recentUpdates.map((update) => (
            <View key={update.id} style={[styles.feedCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={[styles.feedHeader, isRTL && styles.rowRTL]}>
                <View style={[styles.feedAuthorBlock, isRTL && styles.rowRTL]}>
                  <View style={[styles.feedAvatar, { backgroundColor: '#a855f730' }]}>
                    <Text style={styles.feedAvatarText}>
                      {update.authorName ? update.authorName[0].toUpperCase() : 'P'}
                    </Text>
                  </View>
                  <View style={[styles.feedAuthorMeta, { marginLeft: isRTL ? 0 : 10, marginRight: isRTL ? 10 : 0 }]}>
                    <Text style={[styles.feedAuthorName, { color: theme.text }]}>
                      {update.authorName || (isRTL ? 'راكب' : 'Passenger')}
                    </Text>
                    {update.trainNumber && (
                      <Text style={[styles.feedTrain, { color: theme.textSecondary }]}>
                        {isRTL ? `قطار ${update.trainNumber}` : `Train ${update.trainNumber}`}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={[styles.feedTime, { color: theme.textSecondary }]}>
                  {update.createdAt
                    ? new Date(update.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''}
                </Text>
              </View>

              <Text style={[styles.feedContent, { color: theme.text }, isRTL && styles.textRTL]}>
                {update.content}
              </Text>

              <View style={[styles.feedMetaRow, isRTL && { flexDirection: 'row-reverse' }]}>
                {update.statusTag && (
                  <View style={[styles.metaBadge, { backgroundColor: '#6366f120' }]}>
                    <Text style={[styles.metaBadgeText, { color: '#6366f1' }]}>{t(update.statusTag)}</Text>
                  </View>
                )}
                {update.crowdState && (
                  <View style={[styles.metaBadge, { backgroundColor: '#a855f720' }]}>
                    <Text style={[styles.metaBadgeText, { color: '#a855f7' }]}>{t(update.crowdState)}</Text>
                  </View>
                )}
                {update.latitude && update.longitude && (
                  <View style={[styles.metaBadge, { backgroundColor: theme.border }]}>
                    <Ionicons name="pin" size={10} color={theme.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaBadgeText, { color: theme.textSecondary }]}>{t('gpsMapPin')}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Navbar ──
  navbar: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 },
  userInfo: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  welcomeText: { fontSize: 15, color: '#64748b' },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  // ── Error ──
  errorContainer: {
    borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center',
  },
  errorText: { fontSize: 14, textAlign: 'center', marginBottom: 10 },
  retryButton: { backgroundColor: '#f87171', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 16 },
  retryText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  // ── Stats ──
  statsContainer: { marginBottom: 20 },
  statsContent: { flexDirection: 'row', gap: 10 },
  statCard: {
    borderWidth: 1, borderRadius: 14, padding: 14, minWidth: 95,
    alignItems: 'center', marginRight: 4,
  },
  statNumber: { fontSize: 22, fontWeight: '800', marginTop: 6 },
  statLabel: { fontSize: 11, marginTop: 3, textAlign: 'center' },

  // ── Trips Header ──
  tripsHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12, marginTop: 4,
  },
  tripsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#fff' },
  countBadge: {
    backgroundColor: '#10b98120', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  countBadgeText: { color: '#10b981', fontSize: 12, fontWeight: 'bold' },

  // ── Pill Toggle ──
  pillToggle: {
    flexDirection: 'row', borderRadius: 20, borderWidth: 1,
    overflow: 'hidden', padding: 2,
  },
  pillBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 18,
  },
  pillBtnActive: { backgroundColor: '#6366f1' },
  pillBtnText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  pillBtnTextActive: { color: '#fff' },

  // ── Trip List ──
  listContainer: {
    borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 20,
  },
  emptyCard: {
    borderWidth: 1, borderRadius: 14, padding: 28,
    alignItems: 'center', marginBottom: 20,
  },
  emptyText: { fontSize: 14, textAlign: 'center', color: '#64748b' },
  tripItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 14, paddingTop: 18,
    borderBottomWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  // Corner dot for followed trips
  followedDot: {
    position: 'absolute',
    top: 0,
    width: 18,
    height: 18,
    backgroundColor: '#f97316',
    zIndex: 10,
  },
  rowRTL: { flexDirection: 'row-reverse' },
  textRTL: { textAlign: 'right' },
  tripLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  trainNumberBadge: {
    minWidth: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#6366f120',
  },
  trainNumberText: { color: '#6366f1', fontWeight: 'bold', fontSize: 13 },
  tripMeta: { flex: 1 },
  trainName: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  trainSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

  // ── Section Header ──
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 },

  // ── Feed ──
  feedContainer: { gap: 10 },
  feedCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  feedHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  feedAuthorBlock: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  feedAvatar: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },
  feedAvatarText: { color: '#a855f7', fontWeight: 'bold', fontSize: 14 },
  feedAuthorMeta: { flex: 1 },
  feedAuthorName: { fontSize: 13, fontWeight: '600', color: '#fff' },
  feedTrain: { color: '#6366f1', fontSize: 11, marginTop: 2 },
  feedTime: { fontSize: 11, color: '#475569' },
  feedContent: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  feedMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  metaBadgeText: { fontSize: 10, fontWeight: '600' },
});
