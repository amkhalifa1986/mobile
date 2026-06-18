import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Switch } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import api, { API_BASE_URL } from '../config/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUser } = useContext(AuthContext);
  const { t, locale, isRTL, changeLanguage } = useLanguage();
  const { isDarkMode, theme, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  
  const [history, setHistory] = useState([]);
  const [upcomingTrips, setUpcomingTrips] = useState([]);
  const [followedPlans, setFollowedPlans] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchProfileData = async () => {
    try {
      const [historyRes, upcomingRes, followedRes] = await Promise.all([
        api.get('/api/profile/history'),
        api.get('/api/profile/upcoming-trips'),
        api.get('/api/profile/followed-trains')
      ]);

      setHistory(historyRes || []);
      setUpcomingTrips(upcomingRes || []);
      setFollowedPlans(followedRes || []);
    } catch (err) {
      console.error('Failed to load profile data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const handleUpdateProfile = async () => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.put('/api/profile', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        avatarUrl: user?.avatarUrl || null
      });

      if (updateUser) {
        updateUser({ displayName: displayName.trim(), bio: bio.trim() || null });
      }
      setSuccess(t('profileUpdated'));
    } catch (err) {
      console.error(err);
      setError(isRTL ? 'فشل تحديث الملف الشخصي. حاول مرة أخرى.' : 'Failed to update profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectImage = () => {
    Alert.alert(
      t('profilePicture'),
      isRTL ? 'اختر خياراً:' : 'Choose an option:',
      [
        { text: t('takePhoto'), onPress: handleCameraLaunch },
        { text: t('chooseFromLibrary'), onPress: handleLibraryLaunch },
        { text: t('cancel'), style: 'cancel' }
      ]
    );
  };

  const handleCameraLaunch = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissionDenied'), isRTL ? 'مطلوب إذن الكاميرا لالتقاط الصور.' : 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const handleLibraryLaunch = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissionDenied'), isRTL ? 'مطلوب إذن المعرض لاختيار الصور.' : 'Gallery permission is required to choose photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri) => {
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename || '');
      const type = match ? `image/${match[1]}` : `image`;

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: filename || 'avatar.jpg',
        type
      });

      const res = await api.post('/api/profile/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const fileUrl = res;

      await api.put('/api/profile', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        avatarUrl: fileUrl
      });

      if (updateUser) {
        updateUser({ avatarUrl: fileUrl });
      }
      setSuccess(t('profilePicUpdated'));
    } catch (err) {
      console.error('Failed to upload avatar', err);
      setError(isRTL ? 'فشل رفع صورة الملف الشخصي.' : 'Failed to upload profile picture.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnfollowUpcomingTrip = (tripId) => {
    Alert.alert(
      t('unfollowTrip'),
      t('unfollowConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unfollow'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/trips/${tripId}/follow`);
              fetchProfileData();
            } catch (err) {
              console.error(err);
              Alert.alert(t('Error'), isRTL ? 'فشل إلغاء متابعة الرحلة' : 'Failed to unfollow trip');
            }
          }
        }
      ]
    );
  };

  const handleCancelFollowPlan = (trainId) => {
    Alert.alert(
      t('cancelPlan'),
      t('cancelPlanConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/trains/${trainId}/follow-plan`);
              fetchProfileData();
            } catch (err) {
              console.error(err);
              Alert.alert(t('Error'), isRTL ? 'فشل حذف خطة المتابعة' : 'Failed to delete follow plan');
            }
          }
        }
      ]
    );
  };

  const getGroupedPlans = () => {
    const groups = {};
    followedPlans.forEach((plan) => {
      if (!groups[plan.trainId]) {
        groups[plan.trainId] = {
          trainId: plan.trainId,
          trainNumber: plan.trainNumber,
          trainNameAr: plan.trainNameAr,
          trainNameEn: plan.trainNameEn,
          configs: []
        };
      }
      groups[plan.trainId].configs.push({
        id: plan.id,
        dayOfWeek: plan.dayOfWeek,
        roleType: plan.roleType,
        targetStopNameAr: plan.targetStopNameAr,
        targetStopNameEn: plan.targetStopNameEn,
        alertLeadTimeMinutes: plan.alertLeadTimeMinutes
      });
    });

    Object.values(groups).forEach((group) => {
      group.configs.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    });

    return Object.values(groups);
  };

  const getDayName = (dayIndex) => {
    const daysEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const daysAr = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return isRTL ? daysAr[dayIndex] : daysEn[dayIndex];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.scrollContent}>
      {/* Title */}
      <View style={[styles.header, isRTL && styles.rowRTL]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('profile')}</Text>
        <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
          <TouchableOpacity 
            style={[styles.themeToggleBtn, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }]} 
            onPress={toggleTheme}
          >
            <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={18} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.langToggle, { backgroundColor: theme.cardBackground, borderColor: theme.border }]} 
            onPress={() => changeLanguage(locale === 'en' ? 'ar' : 'en')}
          >
            <Text style={[styles.langToggleText, { color: theme.textSecondary }]}>{locale === 'en' ? 'العربية' : 'EN'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Avatar Section */}
      <View style={[styles.avatarSection, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        {user?.avatarUrl ? (
          <Image
            source={{ uri: user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API_BASE_URL}${user.avatarUrl}` }}
            style={styles.avatarImage}
          />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.avatarPlaceholderText, { color: theme.primary }]}>
              {user?.displayName ? user.displayName[0].toUpperCase() : 'U'}
            </Text>
          </View>
        )}
        <TouchableOpacity style={[styles.avatarEditBtn, { backgroundColor: theme.primary }]} onPress={handleSelectImage}>
          <Ionicons name="camera-outline" size={16} color="#fff" style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
          <Text style={styles.avatarEditText}>{t('changePhoto')}</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Info Form */}
      <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }, isRTL && styles.textRTL]}>{t('accountSettings')}</Text>

        {success ? <Text style={[styles.successText, { color: theme.successText }, isRTL && styles.textRTL]}>{success}</Text> : null}
        {error ? <Text style={[styles.errorText, { color: theme.errorText }, isRTL && styles.textRTL]}>{error}</Text> : null}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }, isRTL && styles.textRTL]}>{t('displayName')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }, isRTL && styles.textRTL]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('namePlaceholder')}
            placeholderTextColor={theme.inputPlaceholder}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }, isRTL && styles.textRTL]}>{t('bio')}</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }, isRTL && styles.textRTL]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('bioPlaceholder')}
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: theme.primary }, submitting && styles.buttonDisabled]} 
          onPress={handleUpdateProfile}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{t('save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Upcoming Trips Next 24h */}
      <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
        <Ionicons name="time-outline" size={20} color="#f59e0b" />
        <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('upcomingTrips')}</Text>
      </View>
      {upcomingTrips.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noUpcomingTrips')}</Text>
        </View>
      ) : (
        <View style={[styles.listContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          {upcomingTrips.map((trip) => (
            <View key={trip.id} style={[styles.upcomingRow, { borderBottomColor: theme.border }, isRTL && styles.rowRTL]}>
              <View style={styles.upcomingInfo}>
                <Text style={[styles.upcomingTrain, { color: theme.text }, isRTL && styles.textRTL]}>
                  {t('train')} {trip.trainNumber}
                </Text>
                <Text style={[styles.upcomingStation, { color: theme.textSecondary }, isRTL && styles.textRTL]}>
                  {t('to')}: {isRTL ? trip.targetStopNameAr : trip.targetStopNameEn}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleUnfollowUpcomingTrip(trip.id)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={18} color="#f87171" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Followed Plans */}
      <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
        <Ionicons name="calendar-outline" size={20} color="#6366f1" />
        <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('followPlan')}</Text>
      </View>
      {followedPlans.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noFollowPlan')}</Text>
        </View>
      ) : (
        <View style={styles.plansContainer}>
          {getGroupedPlans().map((group) => (
            <View key={group.trainId} style={[styles.planCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={[styles.planHeader, { borderBottomColor: theme.border }, isRTL && styles.rowRTL]}>
                <View>
                  <Text style={[styles.planTrainNumber, { color: theme.primary }]}>
                    {t('train')} {group.trainNumber}
                  </Text>
                  <Text style={[styles.planTrainName, { color: theme.text }, isRTL && styles.textRTL]}>
                    {isRTL ? group.trainNameAr : group.trainNameEn}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleCancelFollowPlan(group.trainId)} style={styles.planDeleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#f87171" />
                </TouchableOpacity>
              </View>

              <View style={styles.configsList}>
                {group.configs.map((config) => (
                  <View key={config.id} style={[styles.configRow, { backgroundColor: theme.inputBg }, isRTL && styles.rowRTL]}>
                    <Text style={[styles.configDay, { color: theme.text }]}>{getDayName(config.dayOfWeek)}</Text>
                    <Text style={[styles.configRole, { color: theme.textSecondary }]}>{t(config.roleType || 'follower')}</Text>
                    <Text style={[styles.configStation, { color: theme.textSecondary }, isRTL && styles.textRTL]}>
                      {isRTL ? config.targetStopNameAr : config.targetStopNameEn}
                    </Text>
                    <Text style={styles.configTime}>{config.alertLeadTimeMinutes}{isRTL ? 'د' : 'm'}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Travel History Log */}
      <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
        <Ionicons name="hourglass-outline" size={20} color="#10b981" />
        <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('tripHistory')}</Text>
      </View>
      {history.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noTripHistory')}</Text>
        </View>
      ) : (
        <View style={[styles.listContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          {history.map((log, index) => (
            <View key={index} style={[styles.historyRow, { borderBottomColor: theme.border }, isRTL && styles.rowRTL]}>
              <View>
                <Text style={[styles.historyTrain, { color: theme.text }, isRTL && styles.textRTL]}>
                  {t('train')} {log.trainNumber}
                </Text>
                <Text style={[styles.historyDate, { color: theme.textSecondary }, isRTL && styles.textRTL]}>{log.tripDate}</Text>
              </View>
              <View style={[styles.historyStatus, { backgroundColor: theme.border }]}>
                <Text style={[styles.historyStatusText, { color: theme.textSecondary }]}>{t(log.status || 'Completed')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Logout Action */}
      <TouchableOpacity style={[styles.logoutButton, isRTL && styles.rowRTL]} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
        <Text style={styles.logoutText}>{t('Logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  langToggle: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  langToggleText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 12,
  },
  themeToggleBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  textRTL: {
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  successText: {
    color: '#10b981',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 50,
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
  },
  listContainer: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  upcomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingTrain: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  upcomingStation: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  plansContainer: {
    gap: 12,
    marginBottom: 20,
  },
  planCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
    paddingBottom: 12,
    marginBottom: 12,
  },
  planTrainNumber: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  planTrainName: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
  },
  planDeleteBtn: {
    padding: 8,
  },
  configsList: {
    gap: 8,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    padding: 8,
    borderRadius: 6,
  },
  configDay: {
    color: '#cbd5e1',
    fontWeight: 'bold',
    fontSize: 12,
    width: 60,
  },
  configRole: {
    color: '#cbd5e1',
    fontSize: 12,
    width: 80,
  },
  configStation: {
    color: '#94a3b8',
    fontSize: 12,
    flex: 1,
  },
  configTime: {
    color: '#f59e0b',
    fontWeight: '600',
    fontSize: 12,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  historyTrain: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  historyDate: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  historyStatus: {
    backgroundColor: '#1e1e2d',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  historyStatusText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  avatarSection: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  avatarEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  avatarEditText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 1,
    marginBottom: 16,
  },
  themeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
