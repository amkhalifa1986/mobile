import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Switch, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import api from '../config/api';
import { Ionicons } from '@expo/vector-icons';
import AdInterstitial from '../components/AdInterstitial';

export default function TrainDetailsScreen({ route, navigation }) {
  const { id } = route.params || {};
  const { t, isRTL } = useLanguage();

  const [train, setTrain] = useState(null);
  const [todayTrip, setTodayTrip] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Follow Plan States
  const [followPlan, setFollowPlan] = useState(null);
  const [loadingFollowPlan, setLoadingFollowPlan] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [submittingFollowPlan, setSubmittingFollowPlan] = useState(false);
  const [dailyConfigs, setDailyConfigs] = useState([]);

  // Station Picker inside Follow Plan Modal
  const [activeSelectIndex, setActiveSelectIndex] = useState(null);
  const [stationPickerVisible, setStationPickerVisible] = useState(false);

  const fetchTrainDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/trains/${id}`);
      setTrain(res);
      
      // Fetch today's trip cross reference
      const todayTrips = await api.get('/api/trips/today');
      if (todayTrips && res) {
        const trip = todayTrips.find((t) => t.trainNumber === res.trainNumber);
        setTodayTrip(trip || null);
      }

      // Fetch all trips for this train
      const tripsRes = await api.get(`/api/trains/${id}/trips`);
      setTrips(tripsRes || []);

      // Fetch follow plan
      await fetchFollowPlan();
    } catch (err) {
      console.error(err);
      setError(t('Failed to retrieve train details.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowPlan = async () => {
    setLoadingFollowPlan(true);
    try {
      const res = await api.get(`/api/trains/${id}/follow-plan`);
      if (res && res.length > 0) {
        setFollowPlan(res);
      } else {
        setFollowPlan(null);
      }
    } catch (err) {
      setFollowPlan(null);
    } finally {
      setLoadingFollowPlan(false);
    }
  };

  useEffect(() => {
    fetchTrainDetails();
  }, [id]);

  const openFollowModal = () => {
    if (!train) return;
    const defaultStop = train.routeStops && train.routeStops.length > 0 
      ? train.routeStops[train.routeStops.length - 1].stopId 
      : '';

    const newConfigs = Array.from({ length: 7 }, (_, index) => {
      const plan = followPlan?.find((p) => p.dayOfWeek === index);
      if (plan) {
        return {
          dayOfWeek: index,
          enabled: true,
          roleType: plan.roleType === 'Passenger' ? 0 : 1,
          targetStopId: plan.targetStopId,
          targetStopName: isRTL ? plan.targetStopNameAr : plan.targetStopNameEn,
          alertLeadTimeMinutes: plan.alertLeadTimeMinutes.toString()
        };
      } else {
        const targetStopObj = train.routeStops && train.routeStops.length > 0
          ? train.routeStops[train.routeStops.length - 1]
          : null;
        return {
          dayOfWeek: index,
          enabled: false,
          roleType: 1, // Follower
          targetStopId: defaultStop,
          targetStopName: targetStopObj ? (isRTL ? targetStopObj.stopNameAr : targetStopObj.stopNameEn) : '',
          alertLeadTimeMinutes: '15'
        };
      }
    });

    setDailyConfigs(newConfigs);
    setShowFollowModal(true);
  };

  const handleSaveFollowPlan = async () => {
    const activeConfigs = dailyConfigs.filter((c) => c.enabled);
    if (activeConfigs.length === 0) {
      Alert.alert(t('Error'), isRTL ? 'يرجى تفعيل خيار المتابعة ليوم واحد على الأقل.' : 'Please enable follow configuration for at least one day.');
      return;
    }
    for (const config of activeConfigs) {
      if (!config.targetStopId) {
        Alert.alert(t('Error'), isRTL ? 'يرجى تحديد محطة الوصول لجميع الأيام المفعّلة.' : 'Please select a target station for all enabled days.');
        return;
      }
    }

    setSubmittingFollowPlan(true);
    try {
      const payload = activeConfigs.map((c) => ({
        dayOfWeek: c.dayOfWeek,
        roleType: c.roleType === 0 ? 'Passenger' : 'Follower',
        targetStopId: c.targetStopId,
        alertLeadTimeMinutes: parseInt(c.alertLeadTimeMinutes) || 15
      }));

      await api.post(`/api/trains/${train.id}/follow-plan`, payload);
      await fetchFollowPlan();
      setShowFollowModal(false);
      Alert.alert(t('Success'), isRTL ? 'تم حفظ خطة المتابعة الأسبوعية بنجاح!' : 'Weekly follow plan saved successfully!');
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), isRTL ? 'فشل حفظ خطة المتابعة' : 'Failed to save follow plan');
    } finally {
      setSubmittingFollowPlan(false);
    }
  };

  const handleDeleteFollowPlan = async () => {
    Alert.alert(
      isRTL ? 'حذف الخطة' : 'Delete Plan',
      isRTL ? 'هل أنت متأكد أنك تريد إلغاء الخطة المتكررة لهذا القطار؟' : 'Are you sure you want to cancel the recurring plan for this train?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/trains/${train.id}/follow-plan`);
              setFollowPlan(null);
              Alert.alert(t('Success'), isRTL ? 'تم إلغاء الخطة بنجاح' : 'Plan cancelled successfully');
            } catch (err) {
              console.error(err);
              Alert.alert(t('Error'), isRTL ? 'فشل حذف خطة المتابعة' : 'Failed to delete follow plan');
            }
          }
        }
      ]
    );
  };

  const selectPlanStation = (station) => {
    const updated = [...dailyConfigs];
    updated[activeSelectIndex].targetStopId = station.stopId;
    updated[activeSelectIndex].targetStopName = isRTL ? station.stopNameAr : station.stopNameEn;
    setDailyConfigs(updated);
    setStationPickerVisible(false);
  };

  const getDayName = (dayIndex) => {
    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const daysAr = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return isRTL ? daysAr[dayIndex] : daysEn[dayIndex];
  };

  const getDayShortName = (dayIndex) => {
    const daysEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const daysAr = ["أحد", "إثن", "ثلا", "أرب", "خميس", "جمع", "سبت"];
    return isRTL ? daysAr[dayIndex] : daysEn[dayIndex];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !train) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#f87171" />
        <Text style={styles.errorText}>{error || (isRTL ? 'القطار غير موجود' : 'Train not found')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? 'رجوع' : 'Go Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AdInterstitial pageKey="trainDetails" instanceId={id} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Train Header Card */}
        <View style={styles.headerCard}>
          <View style={[styles.trainHeaderRow, isRTL && styles.rowRTL]}>
            <View style={styles.trainIconWrapper}>
              <Ionicons name="train" size={32} color="#fff" />
            </View>
            <View style={[styles.trainHeaderMeta, { marginLeft: isRTL ? 0 : 16, marginRight: isRTL ? 16 : 0 }]}>
              <Text style={[styles.trainNumber, isRTL && styles.textRTL]}>
                {isRTL ? `قطار ${train.trainNumber}` : `Train ${train.trainNumber}`}
              </Text>
              <Text style={[styles.trainName, isRTL && styles.textRTL]}>{isRTL ? train.nameAr : train.nameEn}</Text>
            </View>
          </View>
          <Text style={[styles.trainDesc, isRTL && styles.textRTL]}>
            {isRTL ? train.descriptionAr : train.descriptionEn}
          </Text>

          {todayTrip ? (
            <TouchableOpacity
              style={[styles.trackLiveButton, isRTL && styles.rowRTL]}
              onPress={() => navigation.navigate('TripDetails', { id: todayTrip.id })}
            >
              <Ionicons name="pulse" size={20} color="#fff" style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
              <Text style={styles.trackLiveText}>{t('trackLive')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.inactiveTripBadge, isRTL && styles.rowRTL]}>
              <Ionicons name="calendar-outline" size={16} color="#94a3b8" style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
              <Text style={styles.inactiveTripText}>
                {isRTL ? 'لا توجد رحلة نشطة اليوم' : 'Scheduled (No active trip today)'}
              </Text>
            </View>
          )}
        </View>

        {/* Timetable timeline */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="time-outline" size={20} color="#6366f1" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('routeStops')}</Text>
        </View>
        <View style={styles.timelineCard}>
          {train.routeStops && train.routeStops.length > 0 ? (
            train.routeStops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === train.routeStops.length - 1;
              return (
                <View key={stop.id} style={[styles.timelineItem, isRTL && styles.rowRTL]}>
                  <View style={styles.timelineGraphics}>
                    <View style={[styles.timelineLineTop, isFirst && styles.hiddenLine]} />
                    <View style={styles.timelineDot} />
                    <View style={[styles.timelineLineBottom, isLast && styles.hiddenLine]} />
                  </View>
                  <View style={[styles.timelineContent, { marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}>
                    <Text style={[styles.stationName, isRTL && styles.textRTL]}>
                      {isRTL ? stop.stopNameAr : stop.stopNameEn}
                    </Text>
                    <Text style={[styles.timelineTimes, isRTL && styles.textRTL]}>
                      {isFirst
                        ? (isRTL ? `المغادرة: ${stop.scheduledDeparture}` : `Departure: ${stop.scheduledDeparture}`)
                        : isLast
                        ? (isRTL ? `الوصول: ${stop.scheduledArrival}` : `Arrival: ${stop.scheduledArrival}`)
                        : (isRTL ? `وص: ${stop.scheduledArrival} | مغ: ${stop.scheduledDeparture}` : `Arr: ${stop.scheduledArrival} | Dep: ${stop.scheduledDeparture}`)}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.noStopsText, isRTL && styles.textRTL]}>
              {isRTL ? 'لا توجد محطات جدول مسجلة.' : 'No timetable stops registered.'}
            </Text>
          )}
        </View>

        {/* Follow Plan settings */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="calendar-outline" size={20} color="#10b981" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('followPlan')}</Text>
        </View>
        <View style={styles.followCard}>
          {loadingFollowPlan ? (
            <ActivityIndicator color="#6366f1" />
          ) : followPlan ? (
            <View>
              <Text style={[styles.followStatusText, isRTL && styles.textRTL]}>
                {isRTL ? 'خطة أسبوعية نشطة' : 'Active Weekly Plan Set'}
              </Text>
              <View style={styles.planDaysGrid}>
                {followPlan.map((p) => (
                  <View key={p.id} style={[styles.activePlanDayRow, isRTL && styles.rowRTL]}>
                    <Text style={styles.activePlanDayName}>{getDayShortName(p.dayOfWeek)}</Text>
                    <Text style={styles.activePlanDayRole}>
                      {isRTL ? (p.roleType === 'Passenger' ? 'راكب' : 'متابع') : p.roleType}
                    </Text>
                    <Text style={[styles.activePlanDayStation, isRTL && styles.textRTL]}>
                      {isRTL ? p.targetStopNameAr : p.targetStopNameEn}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.planActions, isRTL && styles.rowRTL]}>
                <TouchableOpacity style={styles.planEditButton} onPress={openFollowModal}>
                  <Text style={styles.planEditText}>{t('editPlan')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.planDeleteButton} onPress={handleDeleteFollowPlan}>
                  <Text style={styles.planDeleteText}>{t('delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noPlanBlock}>
              <Text style={[styles.noPlanText, isRTL && styles.textRTL]}>
                {isRTL ? 'ليس لديك خطة متابعة لهذا القطار.' : "You don't have a follow plan for this train."}
              </Text>
              <TouchableOpacity style={styles.createPlanBtn} onPress={openFollowModal}>
                <Text style={styles.createPlanBtnText}>{t('createPlan')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Previous Trips list */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="hourglass-outline" size={20} color="#f59e0b" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
            {isRTL ? 'رحلات سابقة' : 'Previous Trips'}
          </Text>
        </View>
        <View style={styles.listContainer}>
          {trips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.emptyText, isRTL && styles.textRTL]}>
                {isRTL ? 'لا توجد سجلات رحلات تاريخية.' : 'No historical trip logs available.'}
              </Text>
            </View>
          ) : (
            trips.slice(0, 5).map((trip) => (
              <View key={trip.id} style={[styles.tripRow, isRTL && styles.rowRTL]}>
                <View>
                  <Text style={[styles.tripDateText, isRTL && styles.textRTL]}>{trip.tripDate}</Text>
                  <Text style={[styles.tripFollowerText, isRTL && styles.textRTL]}>
                    {isRTL ? `متابعون: ${trip.followerCount}` : `Followers: ${trip.followerCount}`}
                  </Text>
                </View>
                <View style={styles.tripStatusBadge}>
                  <Text style={styles.tripStatusText}>{t(trip.status)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Follow Plan Editor Modal */}
      <Modal
        visible={showFollowModal}
        animationType="slide"
        onRequestClose={() => setShowFollowModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFollowModal(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('followPlan')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.modalScroll}>
            {dailyConfigs.map((config, index) => {
              return (
                <View key={config.dayOfWeek} style={styles.modalConfigCard}>
                  <View style={styles.configHeaderRow}>
                    <Text style={styles.configDayName}>{getDayName(config.dayOfWeek)}</Text>
                    <Switch
                      value={config.enabled}
                      onValueChange={(val) => {
                        const updated = [...dailyConfigs];
                        updated[index].enabled = val;
                        setDailyConfigs(updated);
                      }}
                      trackColor={{ false: '#1e1e2d', true: '#6366f1' }}
                    />
                  </View>

                  {config.enabled ? (
                    <View style={styles.configDetailsContainer}>
                      <Text style={[styles.configLabel, isRTL && styles.textRTL]}>{isRTL ? 'نوع الدور' : 'Role Type'}</Text>
                      <View style={[styles.roleToggleRow, isRTL && styles.rowRTL]}>
                        <TouchableOpacity
                          style={[styles.roleOptionBtn, config.roleType === 0 && styles.roleOptionActive]}
                          onPress={() => { const u = [...dailyConfigs]; u[index].roleType = 0; setDailyConfigs(u); }}
                        >
                          <Text style={[styles.roleOptionText, config.roleType === 0 && styles.roleOptionTextActive]}>
                            {isRTL ? 'راكب' : 'Passenger'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.roleOptionBtn, config.roleType === 1 && styles.roleOptionActive]}
                          onPress={() => { const u = [...dailyConfigs]; u[index].roleType = 1; setDailyConfigs(u); }}
                        >
                          <Text style={[styles.roleOptionText, config.roleType === 1 && styles.roleOptionTextActive]}>
                            {isRTL ? 'متابع' : 'Follower'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.configLabel, isRTL && styles.textRTL]}>{isRTL ? 'محطة الوصول' : 'Target Station'}</Text>
                      <TouchableOpacity
                        style={[styles.modalSelectorBtn, isRTL && styles.rowRTL]}
                        onPress={() => { setActiveSelectIndex(index); setStationPickerVisible(true); }}
                      >
                        <Text style={[styles.modalSelectorText, isRTL && styles.textRTL]}>
                          {config.targetStopName || (isRTL ? 'اختر محطة' : 'Select Stop')}
                        </Text>
                        <Ionicons name={isRTL ? 'chevron-down' : 'chevron-down'} size={18} color="#94a3b8" />
                      </TouchableOpacity>

                      <Text style={[styles.configLabel, isRTL && styles.textRTL]}>
                        {isRTL ? 'دقائق التنبيه قبل الوصول' : 'Alert Minutes Before Arrival'}
                      </Text>
                      <TextInput
                        style={[styles.alertInput, isRTL && styles.textRTL]}
                        value={config.alertLeadTimeMinutes}
                        onChangeText={(val) => { const u = [...dailyConfigs]; u[index].alertLeadTimeMinutes = val.replace(/[^0-9]/g, ''); setDailyConfigs(u); }}
                        keyboardType="numeric"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}

            <TouchableOpacity style={styles.savePlanBtn} onPress={handleSaveFollowPlan} disabled={submittingFollowPlan}>
              {submittingFollowPlan ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.savePlanBtnText}>
                  {isRTL ? 'حفظ إعدادات الخطة' : 'Save Plan Settings'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Target Station Selector (Sub-Modal) */}
      <Modal
        visible={stationPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setStationPickerVisible(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerContentCard}>
            <Text style={[styles.pickerCardTitle, isRTL && styles.textRTL]}>
              {isRTL ? 'اختر محطة الوصول' : 'Select Target Stop'}
            </Text>
            <ScrollView style={styles.pickerScroll}>
              {train.routeStops?.map((stop) => (
                <TouchableOpacity key={stop.id} style={styles.pickerItem} onPress={() => selectPlanStation(stop)}>
                  <Text style={[styles.pickerItemText, isRTL && styles.textRTL]}>
                    {isRTL ? stop.stopNameAr : stop.stopNameEn}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setStationPickerVisible(false)}>
              <Text style={styles.pickerCancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  headerCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  trainHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  textRTL: {
    textAlign: 'right',
  },
  trainIconWrapper: {
    width: 50,
    height: 50,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trainHeaderMeta: {
    marginLeft: 16,
    marginRight: 16,
  },
  trainNumber: {
    color: '#6366f1',
    fontSize: 20,
    fontWeight: 'bold',
  },
  trainName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  trainDesc: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  trackLiveButton: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  trackLiveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inactiveTripBadge: {
    flexDirection: 'row',
    height: 44,
    backgroundColor: '#1e1e2d',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  inactiveTripText: {
    color: '#94a3b8',
    fontSize: 14,
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
  timelineCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 60,
  },
  timelineGraphics: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLineTop: {
    width: 2,
    backgroundColor: '#1e1e2d',
    flex: 1,
  },
  timelineLineBottom: {
    width: 2,
    backgroundColor: '#1e1e2d',
    flex: 1,
  },
  hiddenLine: {
    backgroundColor: 'transparent',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6366f1',
    borderWidth: 2,
    borderColor: '#12121a',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 16,
    paddingBottom: 16,
    justifyContent: 'center',
  },
  timelineTimes: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  noStopsText: {
    color: '#64748b',
    textAlign: 'center',
    padding: 20,
  },
  followCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  followStatusText: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 12,
  },
  planDaysGrid: {
    gap: 8,
    marginBottom: 16,
  },
  activePlanDayRow: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0f',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  activePlanDayName: {
    color: '#fff',
    fontWeight: 'bold',
    width: 50,
  },
  activePlanDayRole: {
    color: '#6366f1',
    fontSize: 12,
    width: 70,
  },
  activePlanDayStation: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
  planActions: {
    flexDirection: 'row',
    gap: 12,
  },
  planEditButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#1e1e2d',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planEditText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  planDeleteButton: {
    width: 80,
    height: 44,
    backgroundColor: '#ef444420',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planDeleteText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  noPlanBlock: {
    alignItems: 'center',
    padding: 16,
  },
  noPlanText: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  createPlanBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  createPlanBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContainer: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  tripDateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tripFollowerText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  tripStatusBadge: {
    backgroundColor: '#1e1e2d',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tripStatusText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 16,
  },
  modalConfigCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  configHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  configDayName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  configDetailsContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2d',
    paddingTop: 16,
  },
  configLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  roleToggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  roleOptionBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleOptionActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  roleOptionText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  roleOptionTextActive: {
    color: '#fff',
  },
  modalSelectorBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 6,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  modalSelectorText: {
    color: '#fff',
    fontSize: 14,
  },
  alertInput: {
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 6,
    height: 44,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 14,
  },
  savePlanBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
  },
  savePlanBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: '#000000a0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContentCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
    padding: 20,
  },
  pickerCardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerScroll: {
    marginBottom: 16,
  },
  pickerItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  pickerItemText: {
    color: '#cbd5e1',
    fontSize: 16,
  },
  pickerCancelBtn: {
    backgroundColor: '#1e1e2d',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCancelBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
