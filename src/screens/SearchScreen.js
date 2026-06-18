import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import api from '../config/api';
import { Ionicons } from '@expo/vector-icons';

export default function SearchScreen({ navigation }) {
  const { t, isRTL } = useLanguage();

  const [searchType, setSearchType] = useState('number'); // 'number' or 'route'
  const [trainNumber, setTrainNumber] = useState('');
  
  const [stops, setStops] = useState([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [fromStop, setFromStop] = useState(null); // { id, code, nameEn, nameAr }
  const [toStop, setToStop] = useState(null); // { id, code, nameEn, nameAr }
  
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [activeSelectType, setActiveSelectType] = useState('from'); // 'from' or 'to'
  const [stationSearchQuery, setStationSearchQuery] = useState('');

  const [results, setResults] = useState([]);
  const [todayTrips, setTodayTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const tripsRes = await api.get('/api/trips/today');
        setTodayTrips(tripsRes || []);
      } catch (err) {
        console.error('Failed to fetch today\'s trips:', err);
      }

      setStopsLoading(true);
      try {
        const stopsRes = await api.get('/api/trains/stops');
        setStops(stopsRes || []);
      } catch (err) {
        console.error('Failed to fetch stops:', err);
      } finally {
        setStopsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setResults([]);

    try {
      let params = {};
      if (searchType === 'number') {
        if (!trainNumber.trim()) {
          setError(t('Please enter a train number.'));
          setLoading(false);
          return;
        }
        params.number = trainNumber.trim();
      } else {
        if (!fromStop || !toStop) {
          setError(t('Please enter both origin and destination.'));
          setLoading(false);
          return;
        }
        params.from = fromStop.code;
        params.to = toStop.code;
      }

      const res = await api.get('/api/trains/search', { params });
      setResults(res || []);
      if (!res || res.length === 0) {
        setError(t('No trains found matching search criteria.'));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getTodayTripForTrain = (trainNo) => {
    return todayTrips.find((t) => t.trainNumber === trainNo);
  };

  const openStationSelector = (type) => {
    setActiveSelectType(type);
    setStationSearchQuery('');
    setStationModalVisible(true);
  };

  const selectStation = (station) => {
    if (activeSelectType === 'from') {
      setFromStop(station);
    } else {
      setToStop(station);
    }
    setStationModalVisible(false);
  };

  const filteredStations = stops.filter((stop) => {
    const query = stationSearchQuery.toLowerCase();
    const nameEn = stop.nameEn ? stop.nameEn.toLowerCase() : '';
    const nameAr = stop.nameAr ? stop.nameAr.toLowerCase() : '';
    const code = stop.code ? stop.code.toLowerCase() : '';
    return nameEn.includes(query) || nameAr.includes(query) || code.includes(query);
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, isRTL && styles.textRTL]}>{t('searchTrains')}</Text>
        <Text style={[styles.subtitle, isRTL && styles.textRTL]}>
          Find trains by their designation number or specify origin/destination stations.
        </Text>

        {/* Tab Selection */}
        <View style={[styles.tabContainer, isRTL && styles.rowRTL]}>
          <TouchableOpacity
            style={[styles.tabButton, searchType === 'number' && styles.tabButtonActive]}
            onPress={() => { setSearchType('number'); setError(''); }}
          >
            <Text style={[styles.tabText, searchType === 'number' && styles.tabTextActive]}>
              {t('byTrain')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, searchType === 'route' && styles.tabButtonActive]}
            onPress={() => { setSearchType('route'); setError(''); }}
          >
            <Text style={[styles.tabText, searchType === 'route' && styles.tabTextActive]}>
              {t('byRoute')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Input Area */}
        <View style={styles.card}>
          {searchType === 'number' ? (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, isRTL && styles.textRTL]}>{t('trainNumber')}</Text>
              <View style={[styles.inputWrapper, isRTL && styles.rowRTL]}>
                <Ionicons name="train-outline" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, isRTL && styles.textRTL]}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor="#475569"
                  value={trainNumber}
                  onChangeText={setTrainNumber}
                  keyboardType="numeric"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
              </View>
            </View>
          ) : (
            <View style={styles.routeContainer}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRTL && styles.textRTL]}>{t('origin')}</Text>
                <TouchableOpacity
                  style={[styles.selectorButton, isRTL && styles.rowRTL]}
                  onPress={() => openStationSelector('from')}
                >
                  <Ionicons name="location-outline" size={20} color="#6366f1" />
                  <Text style={fromStop ? styles.selectorText : styles.selectorPlaceholder}>
                    {fromStop 
                      ? (isRTL ? `${fromStop.nameAr} (${fromStop.code})` : `${fromStop.nameEn} (${fromStop.code})`)
                      : t('selectStation')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRTL && styles.textRTL]}>{t('destination')}</Text>
                <TouchableOpacity
                  style={[styles.selectorButton, isRTL && styles.rowRTL]}
                  onPress={() => openStationSelector('to')}
                >
                  <Ionicons name="flag-outline" size={20} color="#6366f1" />
                  <Text style={toStop ? styles.selectorText : styles.selectorPlaceholder}>
                    {toStop 
                      ? (isRTL ? `${toStop.nameAr} (${toStop.code})` : `${toStop.nameEn} (${toStop.code})`)
                      : t('selectStation')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>{t('Search')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results List */}
        {results.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={[styles.resultsTitle, isRTL && styles.textRTL]}>{t('searchResults')}</Text>
            {results.map((train) => {
              const todayTrip = getTodayTripForTrain(train.trainNumber);
              return (
                <TouchableOpacity
                  key={train.id}
                  style={[styles.resultRow, isRTL && styles.rowRTL]}
                  onPress={() => navigation.navigate('TrainDetails', { id: train.id })}
                >
                  <View style={styles.resultDetails}>
                    <View style={[styles.resultHeader, isRTL && styles.rowRTL]}>
                      <Text style={styles.trainNumberText}>#{train.trainNumber}</Text>
                      {train.pathNameEn ? (
                        <View style={styles.pathBadge}>
                          <Text style={styles.pathBadgeText}>
                            {isRTL ? train.pathNameAr : train.pathNameEn}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.trainNameText, isRTL && styles.textRTL]}>
                      {isRTL ? train.nameAr : train.nameEn}
                    </Text>
                    <Text style={[styles.trainDescText, isRTL && styles.textRTL]}>
                      {isRTL ? train.descriptionAr : train.descriptionEn}
                    </Text>
                  </View>

                  <View style={[styles.resultRight, isRTL && styles.rowRTL]}>
                    {todayTrip ? (
                      <View style={[styles.statusBadge, styles.statusActive]}>
                        <Text style={styles.statusActiveText}>{t('active')}</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.statusScheduled]}>
                        <Text style={styles.statusScheduledText}>{t('Scheduled')}</Text>
                      </View>
                    )}
                    <Ionicons
                      name={isRTL ? 'chevron-back' : 'chevron-forward'}
                      size={20}
                      color="#475569"
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Station Selector Modal */}
      <Modal
        visible={stationModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setStationModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setStationModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('selectStation')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.modalSearchWrapper}>
            <Ionicons name="search" size={20} color="#64748b" style={styles.modalSearchIcon} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search station..."
              placeholderTextColor="#475569"
              value={stationSearchQuery}
              onChangeText={setStationSearchQuery}
              autoFocus
            />
          </View>

          {stopsLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#6366f1" />
            </View>
          ) : (
            <FlatList
              data={filteredStations}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.stationItem}
                  onPress={() => selectStation(item)}
                >
                  <Text style={styles.stationName}>
                    {isRTL ? item.nameAr : item.nameEn}
                  </Text>
                  <Text style={styles.stationCode}>{item.code}</Text>
                </TouchableOpacity>
              )}
            />
          )}
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
  scrollContent: {
    padding: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  textRTL: {
    textAlign: 'right',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
    marginLeft: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  },
  routeContainer: {
    gap: 4,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 12,
  },
  selectorPlaceholder: {
    color: '#cbd5e1',
    marginLeft: 8,
    fontSize: 16,
  },
  selectorText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  searchButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginBottom: 20,
  },
  resultsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resultDetails: {
    flex: 1,
    marginRight: 10,
    marginLeft: 10,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  trainNumberText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pathBadge: {
    backgroundColor: '#6366f120',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    marginRight: 8,
  },
  pathBadgeText: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: 'bold',
  },
  trainNameText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  trainDescText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  resultRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusActive: {
    backgroundColor: '#10b98120',
    borderColor: '#10b981',
  },
  statusActiveText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  statusScheduled: {
    backgroundColor: '#3b82f620',
    borderColor: '#3b82f6',
  },
  statusScheduledText: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '700',
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
  closeButton: {
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
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    margin: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  modalSearchIcon: {
    marginRight: 8,
  },
  modalSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalList: {
    paddingHorizontal: 16,
  },
  stationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  stationName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  stationCode: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
