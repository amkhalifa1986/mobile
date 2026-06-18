import React, { useState, useEffect, useContext, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  FlatList, 
  Modal, 
  ScrollView, 
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLanguage } from '../context/LanguageContext';
import api from '../config/api';
import { Ionicons } from '@expo/vector-icons';

export default function SuggestionsScreen({ navigation }) {
  const { t, isRTL } = useLanguage();

  const [activeFormTab, setActiveFormTab] = useState('train'); // 'train' or 'stop'
  const [activeLogTab, setActiveLogTab] = useState('train');   // 'train' or 'stop'

  // Train Form State
  const [trainNumber, setTrainNumber] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [selectedTrainStops, setSelectedStops] = useState([]);
  const [trainExists, setTrainExists] = useState(false);
  const [checkingTrain, setCheckingTrain] = useState(false);

  // Stop Form State
  const [stopCode, setStopCode] = useState('');
  const [stopNameEn, setStopNameEn] = useState('');
  const [stopNameAr, setStopNameAr] = useState('');
  const [cityId, setCityId] = useState('');
  const [newCityNameEn, setNewCityNameEn] = useState('');
  const [newCityNameAr, setNewCityNameAr] = useState('');
  const [newCityGovernorateId, setNewCityGovernorateId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [stopDescriptionEn, setStopDescriptionEn] = useState('');
  const [stopDescriptionAr, setStopDescriptionAr] = useState('');
  const [markerCoords, setMarkerCoords] = useState(null);

  // Lookup Lists
  const [cities, setCities] = useState([]);
  const [governorates, setGovernorates] = useState([]);
  const [allStops, setAllStops] = useState([]);

  // Proposal Logs
  const [mySuggestions, setMySuggestions] = useState([]);
  const [myStopSuggestions, setMyStopSuggestions] = useState([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Selector Modals
  const [stopModalVisible, setStopModalVisible] = useState(false);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [govModalVisible, setGovModalVisible] = useState(false);
  const [stopSearchQuery, setStopSearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [govSearchQuery, setGovSearchQuery] = useState('');

  const mapRef = useRef(null);

  const fetchLookups = async () => {
    try {
      const [citiesRes, govsRes, stopsRes] = await Promise.all([
        api.get('/api/lookups/cities'),
        api.get('/api/lookups/governorates'),
        api.get('/api/trains/stops')
      ]);
      setCities(citiesRes || []);
      setGovernorates(govsRes || []);
      setAllStops(stopsRes || []);
    } catch (err) {
      console.error('Failed to load lookup data:', err);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const [trainRes, stopRes] = await Promise.all([
        api.get('/api/train-suggestions/mine'),
        api.get('/api/stop-suggestions/mine')
      ]);
      setMySuggestions(trainRes || []);
      setMyStopSuggestions(stopRes || []);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchLookups(), fetchSuggestions()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Request location coordinates for map
  useEffect(() => {
    const requestLocation = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          let loc = await Location.getCurrentPositionAsync({});
          if (loc && loc.coords) {
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setLatitude(coords.latitude.toFixed(6));
            setLongitude(coords.longitude.toFixed(6));
            setMarkerCoords(coords);
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                ...coords,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              });
            }
          }
        } catch (e) {
          console.log('Error fetching current position:', e);
        }
      }
    };
    if (activeFormTab === 'stop') {
      requestLocation();
    }
  }, [activeFormTab]);

  // Train Number blur validation
  const checkTrainNumber = async () => {
    const num = trainNumber.trim();
    if (!num) {
      setTrainExists(false);
      return;
    }
    setCheckingTrain(true);
    try {
      const res = await api.get('/api/trains/search', { params: { number: num } });
      const exists = res && res.some(t => t.trainNumber.toLowerCase() === num.toLowerCase());
      setTrainExists(exists);
    } catch (err) {
      console.error(err);
      setTrainExists(false);
    } finally {
      setCheckingTrain(false);
    }
  };

  const handleAddStop = (stop) => {
    if (selectedTrainStops.some(s => s.id === stop.id)) {
      Alert.alert(t('Warning'), isRTL ? 'هذه المحطة مضافة بالفعل للقطار!' : 'This stop is already added to the train!');
      return;
    }
    setSelectedStops([...selectedTrainStops, stop]);
    setStopModalVisible(false);
  };

  const handleMoveStop = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedTrainStops.length) return;
    
    const updated = [...selectedTrainStops];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    setSelectedStops(updated);
  };

  const handleRemoveStop = (index) => {
    setSelectedStops(selectedTrainStops.filter((_, i) => i !== index));
  };

  const handleTrainSubmit = async () => {
    if (!trainNumber.trim() || !nameEn.trim() || !nameAr.trim()) {
      Alert.alert(t('Error'), 'Please fill in all required fields.');
      return;
    }
    if (selectedTrainStops.length < 2) {
      Alert.alert(t('Warning'), isRTL ? 'يرجى إضافة محطتين على الأقل لمسار القطار.' : 'Please add at least two stops for the train route.');
      return;
    }

    setSubmitting(true);
    const routeStr = selectedTrainStops.map(s => s.nameEn).join(' -> ');

    try {
      await api.post('/api/train-suggestions', {
        trainNumber: trainNumber.trim(),
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        descriptionAr: descriptionAr.trim() || null,
        descriptionEn: descriptionEn.trim() || null,
        routeDescriptionAr: null,
        routeDescriptionEn: routeStr
      });

      Alert.alert(t('Success'), isRTL ? 'شكراً لك! تم تقديم مقترح خط السير للمشرفين.' : 'Thank you! Your route suggestion has been submitted to moderators.');
      setTrainNumber('');
      setNameEn('');
      setNameAr('');
      setDescriptionEn('');
      setDescriptionAr('');
      setSelectedStops([]);
      fetchSuggestions();
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), err.response?.data?.message || 'Failed to submit proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopSubmit = async () => {
    if (!stopCode.trim() || !stopNameEn.trim() || !stopNameAr.trim() || !latitude || !longitude) {
      Alert.alert(t('Error'), 'Please fill in all required fields and pick map coordinates.');
      return;
    }

    if (cityId === 'new' && (!newCityNameEn.trim() || !newCityNameAr.trim() || !newCityGovernorateId)) {
      Alert.alert(t('Error'), 'Please fill in new city details.');
      return;
    }

    setSubmitting(true);

    try {
      const latVal = parseFloat(latitude);
      const lngVal = parseFloat(longitude);

      await api.post('/api/stop-suggestions', {
        code: stopCode.trim().toUpperCase(),
        nameAr: stopNameAr.trim(),
        nameEn: stopNameEn.trim(),
        latitude: latVal,
        longitude: lngVal,
        descriptionAr: stopDescriptionAr.trim() || null,
        descriptionEn: stopDescriptionEn.trim() || null,
        cityId: cityId === 'new' ? null : cityId,
        newCityNameAr: cityId === 'new' ? newCityNameAr.trim() : null,
        newCityNameEn: cityId === 'new' ? newCityNameEn.trim() : null,
        newCityGovernorateId: cityId === 'new' ? newCityGovernorateId : null
      });

      Alert.alert(t('Success'), isRTL ? 'شكراً لك! تم تقديم مقترح المحطة للمشرفين.' : 'Thank you! Your stop suggestion has been submitted to moderators.');
      setStopCode('');
      setStopNameEn('');
      setStopNameAr('');
      setCityId('');
      setNewCityNameEn('');
      setNewCityNameAr('');
      setNewCityGovernorateId('');
      setLatitude('');
      setLongitude('');
      setStopDescriptionEn('');
      setStopDescriptionAr('');
      setMarkerCoords(null);
      fetchSuggestions();
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), err.response?.data?.message || 'Failed to submit proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Approved':
      case 1:
        return { color: '#10b981', label: 'Approved' };
      case 'Rejected':
      case 2:
        return { color: '#ef4444', label: 'Rejected' };
      default:
        return { color: '#f59e0b', label: 'Pending' };
    }
  };

  // Auto-center map when text coordinates are valid
  // MUST be before any early return to comply with Rules of Hooks
  useEffect(() => {
    const latVal = parseFloat(latitude);
    const lngVal = parseFloat(longitude);
    if (!isNaN(latVal) && !isNaN(lngVal) && latVal >= -90 && latVal <= 90 && lngVal >= -180 && lngVal <= 180) {
      const targetCoords = { latitude: latVal, longitude: lngVal };
      if (!markerCoords || markerCoords.latitude !== targetCoords.latitude || markerCoords.longitude !== targetCoords.longitude) {
        setMarkerCoords(targetCoords);
      }
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...targetCoords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);
      }
    }
  }, [latitude, longitude]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </SafeAreaView>
    );
  }

  // Filter lists inside selector modals
  const filteredStops = allStops.filter(s => {
    const q = stopSearchQuery.toLowerCase();
    return (s.nameEn?.toLowerCase() || '').includes(q) || (s.nameAr || '').includes(q) || (s.code?.toLowerCase() || '').includes(q);
  });

  const filteredCities = cities.filter(c => {
    const q = citySearchQuery.toLowerCase();
    return (c.nameEn?.toLowerCase() || '').includes(q) || (c.nameAr || '').includes(q);
  });

  const filteredGovs = governorates.filter(g => {
    const q = govSearchQuery.toLowerCase();
    return (g.nameEn?.toLowerCase() || '').includes(q) || (g.nameAr || '').includes(q);
  });

  const selectedCity = cities.find(c => c.id === cityId);
  const selectedGov = governorates.find(g => g.id === newCityGovernorateId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, isRTL && styles.alignRight]}>
        <Text style={[styles.title, isRTL && styles.textRight]}>{t('suggestions')}</Text>
        <Text style={[styles.subtitle, isRTL && styles.textRight]}>
          {isRTL ? 'ساعدنا في تحسين جداول ومحطات القطارات في مصر.' : 'Help us refine timetables and stations in Egypt.'}
        </Text>
      </View>

      <View style={[styles.tabContainer, isRTL && styles.rowRTL]}>
        <TouchableOpacity 
          style={[styles.tabButton, activeFormTab === 'train' && styles.tabActive]} 
          onPress={() => setActiveFormTab('train')}
        >
          <Ionicons name="train-outline" size={18} color={activeFormTab === 'train' ? '#6366f1' : '#94a3b8'} />
          <Text style={[styles.tabText, activeFormTab === 'train' && styles.tabTextActive]}>
            {isRTL ? 'اقتراح قطار' : 'Suggest Train'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeFormTab === 'stop' && styles.tabActive]} 
          onPress={() => setActiveFormTab('stop')}
        >
          <Ionicons name="map-outline" size={18} color={activeFormTab === 'stop' ? '#6366f1' : '#94a3b8'} />
          <Text style={[styles.tabText, activeFormTab === 'stop' && styles.tabTextActive]}>
            {isRTL ? 'اقتراح محطة' : 'Suggest Stop'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeFormTab === 'history' && styles.tabActive]} 
          onPress={() => setActiveFormTab('history')}
        >
          <Ionicons name="time-outline" size={18} color={activeFormTab === 'history' ? '#6366f1' : '#94a3b8'} />
          <Text style={[styles.tabText, activeFormTab === 'history' && styles.tabTextActive]}>
            {isRTL ? 'سجلاتي' : 'My History'}
          </Text>
        </TouchableOpacity>
      </View>

      {activeFormTab === 'train' && (
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, isRTL && styles.textRight]}>
              {isRTL ? 'اقتراح مسار جديد للقطار' : 'Suggest New Route'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>{t('trainNumber')} *</Text>
              <TextInput 
                style={[styles.input, isRTL && styles.textRight]} 
                placeholder="e.g. 903" 
                placeholderTextColor="#64748b"
                value={trainNumber}
                onChangeText={setTrainNumber}
                onBlur={checkTrainNumber}
              />
              {checkingTrain && <ActivityIndicator size="small" color="#6366f1" style={{ marginTop: 4 }} />}
              {trainExists && (
                <View style={[styles.warningBox, isRTL && styles.rowRTL]}>
                  <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                  <Text style={[styles.warningText, isRTL && styles.textRight]}>
                    {isRTL ? 'رقم القطار موجود بالفعل. إرسال الاقتراح سيطلب تحديثاً للمسار.' : 'Train number already exists. Suggesting will submit a route update request.'}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.row, isRTL && styles.rowRTL]}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }]}>
                <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameEn')} *</Text>
                <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="e.g. Express" placeholderTextColor="#64748b" value={nameEn} onChangeText={setNameEn} />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
                <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameAr')} *</Text>
                <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="مثال: سريع" placeholderTextColor="#64748b" value={nameAr} onChangeText={setNameAr} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>
                {isRTL ? 'الوصف (بالإنجليزية)' : 'Description (English)'}
              </Text>
              <TextInput style={[styles.input, styles.textArea, isRTL && styles.textRight]} multiline numberOfLines={3} value={descriptionEn} onChangeText={setDescriptionEn} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>
                {isRTL ? 'الوصف (بالعربية)' : 'Description (Arabic)'}
              </Text>
              <TextInput style={[styles.input, styles.textArea, isRTL && styles.textRight]} multiline numberOfLines={3} value={descriptionAr} onChangeText={setDescriptionAr} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={[styles.cardTitle, isRTL && styles.textRight]}>
              {isRTL ? 'تسلسل المحطات *' : 'Stops Sequence *'}
            </Text>
            <Text style={[styles.cardSubtitle, isRTL && styles.textRight]}>
              {isRTL ? 'اختر المحطات بالترتيب من البداية إلى النهاية.' : 'Choose stations in order from start to end terminal.'}
            </Text>

            <TouchableOpacity style={[styles.selectorButton, isRTL && styles.rowRTL]} onPress={() => setStopModalVisible(true)}>
              <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
              <Text style={[styles.selectorText, isRTL && styles.textRight]}>
                {isRTL ? 'إضافة محطة وقوف...' : 'Add Station stop...'}
              </Text>
            </TouchableOpacity>

            <View style={styles.stopsList}>
              {selectedTrainStops.map((stop, index) => (
                <View key={stop.id} style={[styles.stopRow, isRTL && styles.rowRTL]}>
                  <View style={[styles.stopOrderCircle, isRTL ? { marginLeft: 10, marginRight: 0 } : { marginRight: 10, marginLeft: 0 }]}>
                    <Text style={styles.stopOrderText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={[styles.stopName, isRTL && styles.textRight]}>{isRTL ? stop.nameAr : stop.nameEn}</Text>
                    <Text style={[styles.stopCode, isRTL && styles.textRight]}>Code: {stop.code}</Text>
                  </View>
                  <View style={[styles.stopActions, isRTL && styles.rowRTL]}>
                    <TouchableOpacity 
                      disabled={index === 0} 
                      onPress={() => handleMoveStop(index, 'up')}
                      style={styles.actionIconButton}
                    >
                      <Ionicons name={isRTL ? "arrow-down" : "arrow-up"} size={16} color={index === 0 ? '#475569' : '#fff'} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      disabled={index === selectedTrainStops.length - 1} 
                      onPress={() => handleMoveStop(index, 'down')}
                      style={styles.actionIconButton}
                    >
                      <Ionicons name={isRTL ? "arrow-up" : "arrow-down"} size={16} color={index === selectedTrainStops.length - 1 ? '#475569' : '#fff'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRemoveStop(index)} style={[styles.actionIconButton, { backgroundColor: '#ef444420' }]}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleTrainSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isRTL ? 'إرسال مقترح القطار' : 'Submit Train Suggestion'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeFormTab === 'stop' && (
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, isRTL && styles.textRight]}>
              {isRTL ? 'اقتراح محطة جديدة' : 'Suggest New Station'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>
                {isRTL ? 'رمز المحطة *' : 'Station Code *'}
              </Text>
              <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="e.g. CAI" placeholderTextColor="#64748b" autoCapitalize="characters" value={stopCode} onChangeText={setStopCode} />
            </View>

            <View style={[styles.row, isRTL && styles.rowRTL]}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }]}>
                <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameEn')} *</Text>
                <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="e.g. Ramses" placeholderTextColor="#64748b" value={stopNameEn} onChangeText={setStopNameEn} />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
                <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameAr')} *</Text>
                <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="مثال: رمسيس" placeholderTextColor="#64748b" value={stopNameAr} onChangeText={setStopNameAr} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>{t('city')} *</Text>
              <TouchableOpacity style={[styles.selectorButton, isRTL && styles.rowRTL]} onPress={() => setCityModalVisible(true)}>
                <Text style={[styles.selectorText, isRTL && styles.textRight]}>
                  {cityId === 'new' ? (isRTL ? '-- اقتراح مدينة جديدة --' : '-- Propose New City --') : selectedCity ? (isRTL ? selectedCity.nameAr : selectedCity.nameEn) : (isRTL ? 'اختر المدينة...' : 'Select City...')}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {cityId === 'new' && (
              <View style={styles.newCityContainer}>
                <Text style={[styles.newCityTitle, isRTL && styles.textRight]}>
                  {isRTL ? 'بيانات المدينة المقترحة' : 'New City Proposals'}
                </Text>
                <View style={[styles.row, isRTL && styles.rowRTL]}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }]}>
                    <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameEn')} *</Text>
                    <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="e.g. Minya" placeholderTextColor="#64748b" value={newCityNameEn} onChangeText={setNewCityNameEn} />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
                    <Text style={[styles.label, isRTL && styles.textRight]}>{t('nameAr')} *</Text>
                    <TextInput style={[styles.input, isRTL && styles.textRight]} placeholder="مثال: المنيا" placeholderTextColor="#64748b" value={newCityNameAr} onChangeText={setNewCityNameAr} />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, isRTL && styles.textRight]}>
                    {isRTL ? 'المحافظة *' : 'Governorate *'}
                  </Text>
                  <TouchableOpacity style={[styles.selectorButton, isRTL && styles.rowRTL]} onPress={() => setGovModalVisible(true)}>
                    <Text style={[styles.selectorText, isRTL && styles.textRight]}>
                      {selectedGov ? (isRTL ? selectedGov.nameAr : selectedGov.nameEn) : (isRTL ? 'اختر المحافظة...' : 'Select Governorate...')}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>{t('coordinates')} *</Text>
              <Text style={[styles.cardSubtitle, isRTL && styles.textRight]}>{t('mapInstruction')}</Text>
              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={{
                    latitude: 26.8206,
                    longitude: 30.8025,
                    latitudeDelta: 6.0,
                    longitudeDelta: 6.0,
                  }}
                  onPress={(e) => {
                    const coords = e.nativeEvent.coordinate;
                    setLatitude(coords.latitude.toFixed(6));
                    setLongitude(coords.longitude.toFixed(6));
                    setMarkerCoords(coords);
                  }}
                >
                  {markerCoords && (
                    <Marker
                      coordinate={markerCoords}
                      draggable
                      onDragEnd={(e) => {
                        const coords = e.nativeEvent.coordinate;
                        setLatitude(coords.latitude.toFixed(6));
                        setLongitude(coords.longitude.toFixed(6));
                        setMarkerCoords(coords);
                      }}
                    />
                  )}
                </MapView>
              </View>
              <View style={[styles.row, isRTL && styles.rowRTL]}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0, marginTop: 12 }]}>
                  <Text style={[styles.label, isRTL && styles.textRight]}>
                    {isRTL ? 'خط العرض (Latitude)' : 'Latitude'}
                  </Text>
                  <TextInput 
                    style={[styles.input, isRTL && styles.textRight]} 
                    keyboardType="numeric" 
                    value={latitude} 
                    onChangeText={setLatitude} 
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0, marginTop: 12 }]}>
                  <Text style={[styles.label, isRTL && styles.textRight]}>
                    {isRTL ? 'خط الطول (Longitude)' : 'Longitude'}
                  </Text>
                  <TextInput 
                    style={[styles.input, isRTL && styles.textRight]} 
                    keyboardType="numeric" 
                    value={longitude} 
                    onChangeText={setLongitude} 
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>
                {isRTL ? 'الوصف (بالإنجليزية)' : 'Description (English)'}
              </Text>
              <TextInput style={[styles.input, styles.textArea, isRTL && styles.textRight]} multiline numberOfLines={2} value={stopDescriptionEn} onChangeText={setStopDescriptionEn} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRight]}>
                {isRTL ? 'الوصف (بالعربية)' : 'Description (Arabic)'}
              </Text>
              <TextInput style={[styles.input, styles.textArea, isRTL && styles.textRight]} multiline numberOfLines={2} value={stopDescriptionAr} onChangeText={setStopDescriptionAr} />
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleStopSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t('submitStop')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeFormTab === 'history' && (
        <View style={styles.historyContainer}>
          <View style={[styles.subTabContainer, isRTL && styles.rowRTL]}>
            <TouchableOpacity 
              style={[styles.subTabButton, activeLogTab === 'train' && styles.subTabActive, isRTL ? { marginLeft: 20, marginRight: 0 } : { marginRight: 20, marginLeft: 0 }]} 
              onPress={() => setActiveLogTab('train')}
            >
              <Text style={[styles.subTabText, activeLogTab === 'train' && styles.subTabTextActive]}>
                {isRTL ? 'اقتراحات القطارات' : 'Train Suggestions'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.subTabButton, activeLogTab === 'stop' && styles.subTabActive]} 
              onPress={() => setActiveLogTab('stop')}
            >
              <Text style={[styles.subTabText, activeLogTab === 'stop' && styles.subTabTextActive]}>
                {isRTL ? 'اقتراحات المحطات' : 'Stop Suggestions'}
              </Text>
            </TouchableOpacity>
          </View>

          {activeLogTab === 'train' ? (
            <FlatList
              data={mySuggestions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                const status = getStatusStyle(item.status);
                return (
                  <View style={styles.historyCard}>
                    <View style={[styles.historyHeader, isRTL && styles.rowRTL]}>
                      <Text style={styles.historyTitle}>
                        {isRTL ? `قطار ${item.trainNumber}` : `Train ${item.trainNumber}`}
                      </Text>
                      <Text style={[styles.statusBadgeText, { color: status.color }]}>
                        {isRTL ? (status.label === 'Approved' ? 'مقبول' : status.label === 'Rejected' ? 'مرفوض' : 'قيد الانتظار') : status.label}
                      </Text>
                    </View>
                    <Text style={[styles.historyText, isRTL && styles.textRight]}>{isRTL ? item.nameAr : item.nameEn}</Text>
                    <Text style={[styles.historyRoute, isRTL && styles.textRight]}>{item.routeDescriptionEn || '-'}</Text>
                    {item.adminNotes ? (
                      <View style={styles.adminNotesBox}>
                        <Text style={[styles.adminNotesTitle, isRTL && styles.textRight]}>
                          {isRTL ? 'ملاحظات المشرف:' : 'Admin Notes:'}
                        </Text>
                        <Text style={[styles.adminNotesText, isRTL && styles.textRight]}>{item.adminNotes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {isRTL ? 'لا توجد مقترحات قطارات مقدمة بعد.' : 'No train suggestions submitted yet.'}
                  </Text>
                </View>
              }
            />
          ) : (
            <FlatList
              data={myStopSuggestions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                const status = getStatusStyle(item.status);
                return (
                  <View style={styles.historyCard}>
                    <View style={[styles.historyHeader, isRTL && styles.rowRTL]}>
                      <Text style={styles.historyTitle}>
                        {isRTL ? `محطة ${item.code}` : `Station ${item.code}`}
                      </Text>
                      <Text style={[styles.statusBadgeText, { color: status.color }]}>
                        {isRTL ? (status.label === 'Approved' ? 'مقبول' : status.label === 'Rejected' ? 'مرفوض' : 'قيد الانتظار') : status.label}
                      </Text>
                    </View>
                    <Text style={[styles.historyText, isRTL && styles.textRight]}>{isRTL ? item.nameAr : item.nameEn}</Text>
                    <Text style={[styles.historyMeta, isRTL && styles.textRight]}>
                      {isRTL ? `الإحداثيات: ${item.latitude}، ${item.longitude}` : `Coords: ${item.latitude}, ${item.longitude}`}
                    </Text>
                    {item.adminNotes ? (
                      <View style={styles.adminNotesBox}>
                        <Text style={[styles.adminNotesTitle, isRTL && styles.textRight]}>
                          {isRTL ? 'ملاحظات المشرف:' : 'Admin Notes:'}
                        </Text>
                        <Text style={[styles.adminNotesText, isRTL && styles.textRight]}>{item.adminNotes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {isRTL ? 'لا توجد مقترحات محطات مقدمة بعد.' : 'No station suggestions submitted yet.'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* STOPS PICKER MODAL */}
      <Modal visible={stopModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
            <Text style={styles.modalTitle}>{isRTL ? 'اختر المحطة' : 'Select Station'}</Text>
            <TouchableOpacity onPress={() => setStopModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalSearchWrapper, isRTL && styles.rowRTL]}>
            <Ionicons name="search" size={20} color="#64748b" style={[styles.searchIcon, isRTL && { marginRight: 0, marginLeft: 8 }]} />
            <TextInput 
              style={[styles.modalSearchInput, isRTL && styles.textRight]} 
              placeholder={isRTL ? 'ابحث باسم المحطة أو الرمز...' : 'Search station name or code...'} 
              placeholderTextColor="#64748b"
              value={stopSearchQuery}
              onChangeText={setStopSearchQuery}
            />
          </View>
          <FlatList
            data={filteredStops}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.listItem, isRTL && styles.rowRTL]} onPress={() => handleAddStop(item)}>
                <Text style={styles.listItemText}>{isRTL ? item.nameAr : item.nameEn} ({item.code})</Text>
                <Ionicons name="add-circle" size={20} color="#6366f1" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{isRTL ? 'لا توجد محطات.' : 'No stations found.'}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* CITY PICKER MODAL */}
      <Modal visible={cityModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
            <Text style={styles.modalTitle}>{isRTL ? 'اختر المدينة' : 'Select City'}</Text>
            <TouchableOpacity onPress={() => setCityModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalSearchWrapper, isRTL && styles.rowRTL]}>
            <Ionicons name="search" size={20} color="#64748b" style={[styles.searchIcon, isRTL && { marginRight: 0, marginLeft: 8 }]} />
            <TextInput 
              style={[styles.modalSearchInput, isRTL && styles.textRight]} 
              placeholder={isRTL ? 'ابحث باسم المدينة...' : 'Search city name...'} 
              placeholderTextColor="#64748b"
              value={citySearchQuery}
              onChangeText={setCitySearchQuery}
            />
          </View>
          <FlatList
            data={[{ id: 'new', nameEn: '-- Suggest a New City --', nameAr: '-- اقتراح مدينة جديدة --' }, ...filteredCities]}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.listItem, isRTL && styles.rowRTL]} 
                onPress={() => {
                  setCityId(item.id);
                  setCityModalVisible(false);
                }}
              >
                <Text style={[styles.listItemText, item.id === 'new' && { color: '#6366f1', fontWeight: 'bold' }]}>
                  {isRTL ? item.nameAr : item.nameEn}
                </Text>
                <Ionicons name={item.id === 'new' ? 'add' : (isRTL ? 'chevron-back' : 'chevron-forward')} size={18} color={item.id === 'new' ? '#6366f1' : '#475569'} />
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* GOVERNORATE PICKER MODAL */}
      <Modal visible={govModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
            <Text style={styles.modalTitle}>{isRTL ? 'اختر المحافظة' : 'Select Governorate'}</Text>
            <TouchableOpacity onPress={() => setGovModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalSearchWrapper, isRTL && styles.rowRTL]}>
            <Ionicons name="search" size={20} color="#64748b" style={[styles.searchIcon, isRTL && { marginRight: 0, marginLeft: 8 }]} />
            <TextInput 
              style={[styles.modalSearchInput, isRTL && styles.textRight]} 
              placeholder={isRTL ? 'ابحث باسم المحافظة...' : 'Search governorate name...'} 
              placeholderTextColor="#64748b"
              value={govSearchQuery}
              onChangeText={setGovSearchQuery}
            />
          </View>
          <FlatList
            data={filteredGovs}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.listItem, isRTL && styles.rowRTL]} 
                onPress={() => {
                  setNewCityGovernorateId(item.id);
                  setGovModalVisible(false);
                }}
              >
                <Text style={styles.listItemText}>{isRTL ? item.nameAr : item.nameEn}</Text>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color="#475569" />
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  textRight: {
    textAlign: 'right',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 8,
    margin: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#1e1e2d',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#6366f1',
    fontWeight: 'bold',
  },
  formScroll: {
    flex: 1,
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 15,
  },
  textArea: {
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f59e0b15',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  selectorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  stopsList: {
    marginTop: 12,
    gap: 8,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c28',
    borderColor: '#2d2d3f',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  stopOrderCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopOrderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stopCode: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  stopActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionIconButton: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  newCityContainer: {
    backgroundColor: '#1c1c28',
    borderColor: '#2d2d3f',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  newCityTitle: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  mapContainer: {
    height: 200,
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderColor: '#1e1e2d',
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  subTabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  subTabButton: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActive: {
    borderBottomColor: '#6366f1',
  },
  subTabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  historyCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  historyText: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 6,
  },
  historyRoute: {
    color: '#64748b',
    fontSize: 12,
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  adminNotesBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#ef44440c',
    borderColor: '#ef444430',
    borderWidth: 1,
    borderRadius: 6,
  },
  adminNotesTitle: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  adminNotesText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
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
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    margin: 16,
    paddingHorizontal: 10,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  modalSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#12121a',
  },
  listItemText: {
    color: '#cbd5e1',
    fontSize: 15,
  },
});
