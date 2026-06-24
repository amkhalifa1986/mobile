import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, Dimensions, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useLanguage } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import api, { API_BASE_URL } from '../config/api';
import signalrService from '../services/signalrService';
import locationService from '../services/locationService';
import { Ionicons } from '@expo/vector-icons';
import AdInterstitial from '../components/AdInterstitial';
import { useTheme } from '../context/ThemeContext';

export default function TripDetailsScreen({ route, navigation }) {
  const { id } = route.params || {};
  const { t, isRTL } = useLanguage();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { user } = useContext(AuthContext);

  const [trip, setTrip] = useState(null);
  const [liveTelemetry, setLiveTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Map States
  const [isAutoCentering, setIsAutoCentering] = useState(true);
  const mapRef = useRef(null);

  // Passenger GPS Telemetry Broadcast
  const [passengerMode, setPassengerMode] = useState(false);
  const [passengerCoords, setPassengerCoords] = useState(null);
  const locationSubscriptionRef = useRef(null);
  const telemetryIntervalRef = useRef(null);
  const passengerCoordsRef = useRef(null);

  // Post Update Form
  const [content, setContent] = useState('');
  const [statusTag, setStatusTag] = useState('');
  const [crowdState, setCrowdState] = useState('');
  const [shareGPS, setShareGPS] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);

  // Dropdown picker visibility states
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCrowdPicker, setShowCrowdPicker] = useState(false);

  // Fetch initial details
  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/api/trips/${id}`);
      setTrip(res);

      // Fetch latest tracking telemetry
      const trackingRes = await api.get(`/api/trips/${id}/tracking`);
      if (trackingRes) {
        setLiveTelemetry(trackingRes);
      }
    } catch (err) {
      console.error(err);
      setError(isRTL ? 'فشل تحميل تفاصيل الرحلة.' : 'Failed to load trip details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTripDetails();

    // SignalR Setup
    const setupSignalR = async () => {
      try {
        await signalrService.connect();
        await signalrService.joinTrip(id);
      } catch (err) {
        console.error('SignalR setup failed:', err);
      }
    };
    setupSignalR();

    // Register listeners
    const unsubscribeLocation = signalrService.registerLocationListener((locUpdate) => {
      if (locUpdate.tripId === id.toString()) {
        setLiveTelemetry(locUpdate);
      }
    });

    const unsubscribeUpdate = signalrService.registerListener((update) => {
      setTrip((prev) => {
        if (!prev) return null;
        const updateId = update.id || update.Id;
        if (prev.recentUpdates?.some((u) => (u.id || u.Id) === updateId)) return prev;

        let shouldRefresh = false;
        if (!update.authorId && update.statusTag) {
          const validStatuses = ['Scheduled', 'Departed', 'InTransit', 'Arrived', 'Cancelled', 'Delayed'];
          if (validStatuses.some(s => s.toLowerCase() === update.statusTag.toLowerCase())) {
            shouldRefresh = true;
          }
        }

        if (shouldRefresh) {
          setTimeout(() => {
            fetchTripDetails();
          }, 100);
        }

        return {
          ...prev,
          recentUpdates: [update, ...(prev.recentUpdates || [])],
        };
      });
    });

    return () => {
      signalrService.leaveTrip(id);
      unsubscribeLocation();
      unsubscribeUpdate();
    };
  }, [id]);

  // Passenger Telemetry Broadcasting Logic
  useEffect(() => {
    const startBroadcasting = async () => {
      try {
        const watchSub = await locationService.watchLocation((coords) => {
          setPassengerCoords(coords);
          passengerCoordsRef.current = coords;
        });
        locationSubscriptionRef.current = watchSub;

        telemetryIntervalRef.current = setInterval(async () => {
          const currentCoords = passengerCoordsRef.current;
          if (currentCoords) {
            try {
              const res = await api.post(`/api/trips/${id}/telemetry`, {
                latitude: currentCoords.latitude,
                longitude: currentCoords.longitude,
                speed: currentCoords.speed || 0,
              });
              if (res && res.isSuccess && res.data) {
                setLiveTelemetry(res.data);
              }
            } catch (err) {
              console.error('Failed to submit passenger telemetry:', err);
            }
          }
        }, 10000);
      } catch (e) {
        console.error('Location broadcast failed:', e);
        Alert.alert(
          isRTL ? 'خطأ في الأذونات' : 'Permission Error',
          isRTL ? 'يرجى منح أذونات الموقع لمشاركة GPS.' : 'Please grant location permissions to share GPS.'
        );
        setPassengerMode(false);
      }
    };

    if (passengerMode) {
      startBroadcasting();
    } else {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
      if (telemetryIntervalRef.current) {
        clearInterval(telemetryIntervalRef.current);
        telemetryIntervalRef.current = null;
      }
      setPassengerCoords(null);
      passengerCoordsRef.current = null;
    }

    return () => {
      if (locationSubscriptionRef.current) locationSubscriptionRef.current.remove();
      if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
    };
  }, [passengerMode]);

  // Center map on train position
  useEffect(() => {
    if (isAutoCentering && liveTelemetry && liveTelemetry.snappedLatitude && liveTelemetry.snappedLongitude && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: liveTelemetry.snappedLatitude,
        longitude: liveTelemetry.snappedLongitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 1000);
    }
  }, [liveTelemetry, isAutoCentering]);

  // Follow Toggle
  const handleToggleFollow = async () => {
    if (!trip) return;
    try {
      if (trip.isFollowedByCurrentUser) {
        await api.delete(`/api/trips/${trip.id}/follow`);
        setTrip((prev) => prev ? { ...prev, isFollowedByCurrentUser: false, followerCount: prev.followerCount - 1 } : null);
      } else {
        await api.post(`/api/trips/${trip.id}/follow`);
        setTrip((prev) => prev ? { ...prev, isFollowedByCurrentUser: true, followerCount: prev.followerCount + 1 } : null);
      }
    } catch (err) {
      Alert.alert(t('Error'), isRTL ? 'فشل تحديث حالة المتابعة' : 'Failed to update follow status');
    }
  };

  // Follower crowdsourced prompts
  const handlePromptSubmit = async (status) => {
    try {
      const res = await api.put(`/api/trips/${trip.id}/status`, { status });
      if (res && res.isSuccess && res.data) {
        setTrip(prev => prev ? { 
          ...prev, 
          status: res.data.status,
          statusDetails: res.data.statusDetails
        } : null);
      }
      Alert.alert(t('Success'), isRTL ? 'تم إرسال التحقق من الحالة بنجاح!' : 'Status verification sent successfully!');
      fetchTripDetails();
    } catch (err) {
      Alert.alert(t('Error'), isRTL ? 'فشل تحديث الحالة' : 'Failed to update status');
    }
  };

  // Liking updates
  const handleToggleThanks = async (updateId) => {
    try {
      const res = await api.post(`/api/trips/updates/${updateId}/thanks`);
      if (res && res.isSuccess && res.data) {
        const { thanksCount, isThanked } = res.data;
        setTrip((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            recentUpdates: prev.recentUpdates.map((u) => 
              u.id === updateId 
                ? { ...u, thanksCount, isThankedByCurrentUser: isThanked } 
                : u
            ),
          };
        });
      }
    } catch (err) {
      console.error('Failed to toggle thanks', err);
    }
  };

  // Deleting own update
  const handleRequestRemoval = (updateId) => {
    Alert.alert(
      isRTL ? 'حذف التقرير' : 'Delete Update',
      isRTL ? 'هل أنت متأكد أنك تريد حذف تقريرك؟' : 'Are you sure you want to delete your report?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/trips/updates/${updateId}/removal-request`);
              setTrip((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  recentUpdates: prev.recentUpdates.filter((u) => u.id !== updateId),
                };
              });
            } catch (err) {
              Alert.alert(t('Error'), isRTL ? 'فشل حذف التقرير' : 'Failed to remove report');
            }
          }
        }
      ]
    );
  };

  // Share Live Update
  const handlePostUpdate = async () => {
    if (!content.trim()) return;

    setSubmittingUpdate(true);
    let coords = { latitude: null, longitude: null };

    if (shareGPS) {
      try {
        const currentLoc = await locationService.getCurrentLocation();
        coords = { latitude: currentLoc.latitude, longitude: currentLoc.longitude };
      } catch (e) {
        console.error('Could not get GPS for report', e);
      }
    }

    try {
      const res = await api.post(`/api/trips/${trip.id}/updates`, {
        content: content.trim(),
        statusTag: statusTag || null,
        crowdState: crowdState || null,
        latitude: coords.latitude,
        longitude: coords.longitude
      });

      if (res && res.isSuccess && res.data) {
        const savedUpdate = res.data;
        setTrip((prev) => {
          if (!prev) return null;
          return { ...prev, recentUpdates: [savedUpdate, ...(prev.recentUpdates || [])] };
        });
        setContent('');
        setStatusTag('');
        setCrowdState('');
        setShareGPS(false);
      }
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), isRTL ? 'فشل نشر التحديث' : 'Failed to post update');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  // Status Tag Style Mapping
  const getStatusTagStyle = (tag) => {
    switch (tag?.toLowerCase()) {
      case 'ontime':
        return { bg: '#3b82f620', text: '#3b82f6' };
      case 'delayed':
        return { bg: '#ef444420', text: '#ef4444' };
      case 'cancelled':
        return { bg: '#374151', text: '#cbd5e1' };
      case 'atstation':
      case 'arrived':
        return { bg: '#10b98120', text: '#10b981' };
      default:
        return { bg: '#1e1e2d', text: '#94a3b8' };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#f87171" />
        <Text style={styles.errorText}>{error || (isRTL ? 'الرحلة غير موجودة' : 'Trip not found')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? 'رجوع' : 'Go Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Draw Polyline path coordinates
  const polylinePoints = (trip.routePath || []).map((coord) => ({
    latitude: coord[0],
    longitude: coord[1],
  }));

  // Initial bounds region
  const initialRegion = {
    latitude: 26.8206,
    longitude: 30.8025,
    latitudeDelta: 8.0,
    longitudeDelta: 8.0,
  };

  return (
    <SafeAreaView style={styles.container}>
      <AdInterstitial pageKey="tripDetails" instanceId={id} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Trip Header */}
        <View style={styles.headerCard}>
          <View style={[styles.headerRow, isRTL && styles.rowRTL]}>
            <View style={styles.headerMeta}>
              <Text style={[styles.trainNumber, isRTL && styles.textRTL]}>
                {isRTL ? `قطار ${trip.trainNumber}` : `Train ${trip.trainNumber}`}
              </Text>
              <Text style={[styles.trainName, isRTL && styles.textRTL]}>{isRTL ? trip.trainNameAr : trip.trainNameEn}</Text>
              <Text style={[styles.tripDate, isRTL && styles.textRTL]}>
                {trip.tripDate} • {trip.followerCount} {isRTL ? 'متابع' : 'Followers'}
              </Text>
              <View style={[styles.badgesRow, { marginTop: 8, marginBottom: 0 }, isRTL && styles.rowRTL]}>
                <View style={{ 
                  backgroundColor: trip.statusDetails?.color ? `${trip.statusDetails.color}20` : '#1e1e2d', 
                  borderColor: trip.statusDetails?.color ? `${trip.statusDetails.color}40` : '#334155',
                  borderWidth: 1,
                  borderRadius: 4,
                  paddingHorizontal: 7,
                  paddingVertical: 2
                }}>
                  <Text style={{ color: trip.statusDetails?.color || '#94a3b8', fontSize: 10, fontWeight: '700' }}>
                    {isRTL 
                      ? (trip.statusDetails?.nameAr || trip.status) 
                      : (trip.statusDetails?.nameEn || trip.status)}
                  </Text>
                </View>
                {(isRTL ? trip.trainTypeNameAr : trip.trainTypeNameEn) && (
                  <View style={{ 
                    backgroundColor: '#10b98120', 
                    borderColor: '#10b98140', 
                    borderWidth: 1,
                    borderRadius: 4,
                    paddingHorizontal: 7,
                    paddingVertical: 2
                  }}>
                    <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '700' }}>
                      {isRTL ? trip.trainTypeNameAr : trip.trainTypeNameEn}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity 
              style={[styles.followBtn, trip.isFollowedByCurrentUser && styles.followBtnActive]} 
              onPress={handleToggleFollow}
            >
              <Ionicons 
                name={trip.isFollowedByCurrentUser ? "bookmark" : "bookmark-outline"} 
                size={18} 
                color={trip.isFollowedByCurrentUser ? "#fff" : "#cbd5e1"} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Start / End Prompt Banners */}
        {trip.isFollowedByCurrentUser && trip.status === 'Scheduled' && new Date(trip.startTime) <= new Date() && (
          <View style={[styles.promptBanner, isRTL && styles.rowRTL]}>
            <Ionicons name="help-circle-outline" size={24} color="#f59e0b"
              style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.promptTitle, isRTL && styles.textRTL]}>{t('startPrompt')}</Text>
              <View style={[styles.promptBtnsRow, isRTL && styles.rowRTL]}>
                <TouchableOpacity style={styles.promptBtn} onPress={() => handlePromptSubmit('InTransit')}>
                  <Text style={styles.promptBtnText}>{t('yes')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {trip.isFollowedByCurrentUser && (trip.status === 'InTransit' || trip.status === 'Scheduled') && new Date(trip.endTime) <= new Date() && (
          <View style={[styles.promptBanner, isRTL && styles.rowRTL]}>
            <Ionicons name="help-circle-outline" size={24} color="#f59e0b"
              style={{ marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.promptTitle, isRTL && styles.textRTL]}>{t('endPrompt')}</Text>
              <View style={[styles.promptBtnsRow, isRTL && styles.rowRTL]}>
                <TouchableOpacity style={styles.promptBtn} onPress={() => handlePromptSubmit('Arrived')}>
                  <Text style={styles.promptBtnText}>{t('yes')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Live Route Tracking Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={initialRegion}
            customMapStyle={mapStyleJson}
            onPanDrag={() => setIsAutoCentering(false)}
          >
            {/* Draw Path */}
            {polylinePoints.length > 0 && (
              <Polyline
                coordinates={polylinePoints}
                strokeColor="#3b82f6"
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
            )}

            {/* Draw Station Pins */}
            {trip.routeStops?.map((stop, index) => (
              <Marker
                key={`${stop.stopId || stop.id}-${stop.stopOrder || index}`}
                coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                title={isRTL ? stop.stopNameAr : stop.stopNameEn}
                description={stop.stopCode}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.stationMarkerDot} />
              </Marker>
            ))}

            {/* Pulsing Train Marker */}
            {liveTelemetry?.snappedLatitude ? (
              <Marker
                coordinate={{
                  latitude: liveTelemetry.snappedLatitude,
                  longitude: liveTelemetry.snappedLongitude
                }}
                title={`Train ${trip.trainNumber}`}
                description={`Speed: ${(liveTelemetry.speed || 0).toFixed(1)} km/h`}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                {trip.markerPngUrl ? (
                  <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                      source={{ uri: `${API_BASE_URL}${trip.markerPngUrl}` }}
                      style={{ width: 36, height: 36, resizeMode: 'contain' }}
                    />
                  </View>
                ) : (
                  <View style={styles.trainMarkerOutline}>
                    <View style={styles.trainMarkerDot} />
                  </View>
                )}
              </Marker>
            ) : null}

            {/* Passenger Broadcast marker */}
            {passengerCoords ? (
              <Marker
                coordinate={{
                  latitude: passengerCoords.latitude,
                  longitude: passengerCoords.longitude
                }}
                title="My Location"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.trainMarkerOutline, { backgroundColor: '#3b82f640' }]}>
                  <View style={[styles.trainMarkerDot, { backgroundColor: '#3b82f6' }]} />
                </View>
              </Marker>
            ) : null}
          </MapView>

          {/* Floating Actions */}
          <View style={styles.mapFloatingActions}>
            <TouchableOpacity 
              style={[styles.floatingBtn, isAutoCentering && styles.floatingBtnActive]}
              onPress={() => setIsAutoCentering(true)}
            >
              <Ionicons name="navigate-outline" size={20} color={isAutoCentering ? "#fff" : "#94a3b8"} />
            </TouchableOpacity>
          </View>

          {/* Live HUD overlay */}
          <View style={styles.hudOverlay}>
            <View style={[styles.hudHeader, isRTL && styles.rowRTL]}>
              <View style={styles.pulseDot} />
              <Text style={[styles.hudTitle, { marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }]}>{t('liveTracking')}</Text>
            </View>
            <View style={styles.hudGrid}>
              <View style={styles.hudCard}>
                <Text style={styles.hudVal}>{(liveTelemetry?.speed || 0).toFixed(0)}</Text>
                <Text style={styles.hudLbl}>{isRTL ? 'السرعة كم/س' : 'Speed km/h'}</Text>
              </View>
              <View style={styles.hudCard}>
                <Text style={styles.hudVal}>
                  {liveTelemetry?.upcomingStops ? liveTelemetry.upcomingStops.length : trip.routeStops ? trip.routeStops.length : 0}
                </Text>
                <Text style={styles.hudLbl}>{t('stopsRemaining')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Passenger Mode Geolocation Broadcaster */}
        <View style={styles.broadcastCard}>
          <View style={[styles.broadcastRow, isRTL && styles.rowRTL]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.broadcastTitle, isRTL && styles.textRTL]}>{t('passengerMode')}</Text>
              <Text style={[styles.broadcastSub, isRTL && styles.textRTL]}>
                {isRTL ? 'ساعد الركاب الآخرين بمشاركة إحداثيات GPS من القطار.' : 'Help other commuters by sharing your GPS coordinates from the train.'}
              </Text>
            </View>
            <Switch value={passengerMode} onValueChange={setPassengerMode} trackColor={{ false: '#1e1e2d', true: '#10b981' }} />
          </View>
        </View>

        {/* Stops Sequence Timeline */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="trail-sign-outline" size={20} color="#6366f1" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('routeStops')}</Text>
        </View>
        <View style={styles.timelineCard}>
          {trip.routeStops?.map((stop, index) => (
            <View key={`${stop.stopId || stop.id}-${stop.stopOrder || index}`} style={[styles.timelineRow, isRTL && styles.rowRTL]}>
              <View style={styles.timelineGraphic}>
                <View style={[styles.timelineLineTop, index === 0 && styles.hiddenLine]} />
                <View style={styles.timelineDot} />
                <View style={[styles.timelineLineBottom, index === trip.routeStops.length - 1 && styles.hiddenLine]} />
              </View>
              <View style={[styles.timelineContent, { marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}>
                <Text style={[styles.stopName, isRTL && styles.textRTL]}>{isRTL ? stop.stopNameAr : stop.stopNameEn}</Text>
                <Text style={[styles.stopTime, isRTL && styles.textRTL]}>
                  {isRTL ? `الوصول المجدول: ${stop.scheduledArrival || 'المحطة الأولى'}` : `Scheduled Arrival: ${stop.scheduledArrival || 'Origin'}`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Post Report Form */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="create-outline" size={20} color="#10b981" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>{t('shareUpdate')}</Text>
        </View>
        <View style={styles.postCard}>
          {!trip.isFollowedByCurrentUser ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: '#cbd5e1', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>
                {isRTL ? 'يجب عليك متابعة هذه الرحلة لتتمكن من كتابة تحديث مباشر.' : 'You must follow this trip to post a live update.'}
              </Text>
              <TouchableOpacity 
                style={[styles.promptBtn, { paddingHorizontal: 20, backgroundColor: '#6366f1', borderWidth: 0 }]} 
                onPress={handleToggleFollow}
              >
                <Text style={styles.promptBtnText}>{t('followTrip')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.postInput}
                placeholder={t('writeUpdate')}
                placeholderTextColor="#cbd5e140"
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={3}
              />

              <View style={styles.postOptionsRow}>
                {/* Status Selector */}
                <TouchableOpacity style={styles.formSelector} onPress={() => setShowStatusPicker(true)}>
                  <Text style={styles.formSelectorText}>
                    {statusTag ? t(statusTag) : t('statusTag')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                </TouchableOpacity>

                {/* Crowd Selector */}
                <TouchableOpacity style={styles.formSelector} onPress={() => setShowCrowdPicker(true)}>
                  <Text style={styles.formSelectorText}>
                    {crowdState ? t(crowdState) : t('crowdLevel')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <View style={[styles.gpsShareRow, isRTL && styles.rowRTL]}>
                <Text style={[{ color: '#cbd5e1', fontSize: 14 }, isRTL && styles.textRTL]}>
                  {isRTL ? 'إرفاق موقعي الحالي' : 'Attach my GPS Location'}
                </Text>
                <Switch value={shareGPS} onValueChange={setShareGPS} trackColor={{ false: '#1e1e2d', true: '#6366f1' }} />
              </View>

              <TouchableOpacity 
                style={[styles.postBtn, (submittingUpdate || !content.trim()) && styles.postBtnDisabled]} 
                onPress={handlePostUpdate}
                disabled={submittingUpdate || !content.trim()}
              >
                {submittingUpdate ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.postBtnText}>{t('submit')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Feed of updates */}
        <View style={[styles.sectionHeader, isRTL && styles.rowRTL]}>
          <Ionicons name="chatbubbles-outline" size={20} color="#a855f7" />
          <Text style={[styles.sectionTitle, { marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
            {isRTL ? 'تقارير مباشرة' : 'Live Reports'}
          </Text>
        </View>
        {!trip.recentUpdates || trip.recentUpdates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {isRTL ? 'لا توجد تقارير مشتركة لهذه الرحلة بعد.' : 'No reports shared yet for this trip.'}
            </Text>
          </View>
        ) : (
          <View style={styles.reportsFeed}>
            {trip.recentUpdates.map((update) => {
              const isOwn = update.authorId === user?.id;
              const statusStyle = getStatusTagStyle(update.statusTag);
              return (
                <View key={update.id} style={styles.feedCard}>
                  <View style={[styles.feedHeader, isRTL && styles.rowRTL]}>
                    <View style={[styles.feedAuthorBlock, isRTL && styles.rowRTL]}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {update.authorName ? update.authorName[0].toUpperCase() : 'P'}
                        </Text>
                      </View>
                      <View style={styles.authorMeta}>
                        <Text style={[styles.authorName, isRTL && styles.textRTL]}>{update.authorName}</Text>
                        <Text style={[styles.authorSub, isRTL && styles.textRTL]}>{isRTL ? 'راكب' : 'Passenger'}</Text>
                      </View>
                    </View>
                    <Text style={styles.feedTime}>
                      {update.createdAt 
                        ? new Date(update.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </Text>
                  </View>

                  <Text style={[styles.feedText, isRTL && styles.textRTL]}>{update.content}</Text>

                  {/* Badges row */}
                  <View style={[styles.badgesRow, isRTL && styles.rowRTL]}>
                    {update.statusTag && (
                      <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: statusStyle.text }]}>{t(update.statusTag)}</Text>
                      </View>
                    )}
                    {update.crowdState && (
                      <View style={[styles.badge, { backgroundColor: '#a855f720' }]}>
                        <Text style={[styles.badgeText, { color: '#a855f7' }]}>{t(update.crowdState)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions row */}
                  <View style={[styles.actionsRow, isRTL && styles.rowRTL]}>
                    <TouchableOpacity 
                      style={[styles.thanksBtn, update.isThankedByCurrentUser && styles.thanksBtnActive]}
                      onPress={() => handleToggleThanks(update.id)}
                    >
                      <Ionicons 
                        name={update.isThankedByCurrentUser ? "thumbs-up" : "thumbs-up-outline"} 
                        size={16} 
                        color={update.isThankedByCurrentUser ? "#10b981" : "#cbd5e1"} 
                      />
                      <Text style={[styles.thanksText, update.isThankedByCurrentUser && { color: '#10b981' }]}>
                        {t('thanks')} ({update.thanksCount || 0})
                      </Text>
                    </TouchableOpacity>

                    {isOwn && (
                      <TouchableOpacity onPress={() => handleRequestRemoval(update.id)} style={styles.deleteReportBtn}>
                        <Ionicons name="trash-outline" size={16} color="#f87171" />
                        <Text style={styles.deleteReportText}>{t('deleteReport')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* StatusTag Modal Picker */}
      <Modal visible={showStatusPicker} transparent={true} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModalCard}>
            <Text style={[styles.pickerModalTitle, isRTL && styles.textRTL]}>
              {isRTL ? 'اختر حالة القطار' : 'Select Status Tag'}
            </Text>
            {['OnTime', 'Delayed', 'Cancelled', 'AtStation'].map((tag) => (
              <TouchableOpacity key={tag} style={styles.pickerOption} onPress={() => { setStatusTag(tag); setShowStatusPicker(false); }}>
                <Text style={[styles.pickerOptionText, isRTL && styles.textRTL]}>{t(tag)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStatusPicker(false)}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCrowdPicker} transparent={true} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModalCard}>
            <Text style={[styles.pickerModalTitle, isRTL && styles.textRTL]}>
              {isRTL ? 'اختر مستوى الازدحام' : 'Select Crowd State'}
            </Text>
            {['EmptyChairs', 'FullChairs', 'AisleCrowded', 'Crowded', 'Empty'].map((state) => (
              <TouchableOpacity key={state} style={styles.pickerOption} onPress={() => { setCrowdState(state); setShowCrowdPicker(false); }}>
                <Text style={[styles.pickerOptionText, isRTL && styles.textRTL]}>{t(state)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCrowdPicker(false)}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Styling JSON configuration for dark themed MapView
const mapStyleJson = [
  { "elementType": "geometry", "stylers": [{ "color": "#181824" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#181824" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#74748c" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#a0a0c0" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#28283c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0a0a14" }] }
];

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: theme.errorText,
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
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  textRTL: {
    textAlign: 'right',
  },
  headerMeta: {
    flex: 1,
  },
  trainNumber: {
    color: '#6366f1',
    fontSize: 20,
    fontWeight: 'bold',
  },
  trainName: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  tripDate: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  followBtn: {
    backgroundColor: theme.border,
    borderWidth: 1,
    borderColor: theme.border,
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtnActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  promptBanner: {
    flexDirection: 'row',
    backgroundColor: theme.warningBg,
    borderColor: theme.warningBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  promptTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  promptBtnsRow: {
    flexDirection: 'row',
  },
  promptBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  promptBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  mapContainer: {
    height: 350,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
    borderColor: theme.border,
    borderWidth: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  stationMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#fff',
  },
  trainMarkerOutline: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b98140',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trainMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
  },
  mapFloatingActions: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 8,
  },
  floatingBtn: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingBtnActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  hudOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: theme.cardBackground + 'e0',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  hudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  hudTitle: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  hudGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  hudCard: {
    flex: 1,
    backgroundColor: theme.background + '80',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  hudVal: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  hudLbl: {
    color: theme.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  broadcastCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  broadcastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  broadcastTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  broadcastSub: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 12,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  timelineCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginBottom: 24,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 50,
  },
  timelineGraphic: {
    width: 20,
    alignItems: 'center',
  },
  timelineLineTop: {
    width: 2,
    backgroundColor: theme.border,
    flex: 1,
  },
  timelineLineBottom: {
    width: 2,
    backgroundColor: theme.border,
    flex: 1,
  },
  hiddenLine: {
    backgroundColor: 'transparent',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 16,
    paddingBottom: 12,
  },
  stopName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  stopTime: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  postCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  postInput: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    fontSize: 14,
    textAlignVertical: 'top',
    height: 70,
  },
  postOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  formSelector: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  formSelectorText: {
    color: theme.textSecondary,
    fontSize: 12,
  },
  gpsShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  postBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    color: theme.textSecondary,
  },
  reportsFeed: {
    gap: 12,
    marginBottom: 20,
  },
  feedCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  feedAuthorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: theme.primary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  authorMeta: {
    marginLeft: 10,
    marginRight: 10,
  },
  authorName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  authorSub: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  feedTime: {
    color: theme.textSecondary,
    fontSize: 11,
  },
  feedText: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 10,
  },
  thanksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thanksBtnActive: {
    opacity: 1,
  },
  thanksText: {
    color: theme.textSecondary,
    fontSize: 12,
    marginLeft: 6,
  },
  deleteReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteReportText: {
    color: theme.errorText,
    fontSize: 12,
    marginLeft: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000a0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    backgroundColor: theme.cardBackground,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    width: '100%',
    padding: 20,
  },
  pickerModalTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center',
  },
  pickerOptionText: {
    color: theme.text,
    fontSize: 15,
  },
  cancelBtn: {
    backgroundColor: theme.border,
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  cancelBtnText: {
    color: theme.text,
    fontWeight: 'bold',
  },
});
