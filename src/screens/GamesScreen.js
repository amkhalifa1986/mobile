import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  AppState,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import AdInterstitial from '../components/AdInterstitial';
import api from '../config/api';
import { getSudokuPuzzle, isSolvedBoard } from '../data/sudokuPuzzles';

const DIFFICULTIES = [
  { key: 'Easy', color: '#10b981', descKey: 'easyDesc' },
  { key: 'Medium', color: '#f59e0b', descKey: 'mediumDesc' },
  { key: 'Hard', color: '#ef4444', descKey: 'hardDesc' },
];
const DANGER = '#ef4444';
const AUTO_SAVE_MS = 30000;

const formatTime = (totalSeconds) => {
  const s = Math.max(0, totalSeconds || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return [hrs, mins, secs].map((n) => n.toString().padStart(2, '0')).join(':');
};

const errorMessage = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || fallback;

// Builds the initial board for a session: saved progress if any, otherwise the clues.
const boardForSession = (session, puzzle) => {
  const cells = (session.cellState || '').split('').map(Number);
  const hasProgress = cells.length === 81 && cells.some((x) => x !== 0);
  return hasProgress ? cells : puzzle.puzzle.split('').map(Number);
};

const hasConflict = (board, index) => {
  const val = board[index];
  if (val === 0) return false;
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    const r = row * 9 + i;
    const c = i * 9 + col;
    const b = (boxRow + Math.floor(i / 3)) * 9 + boxCol + (i % 3);
    if ((r !== index && board[r] === val) || (c !== index && board[c] === val) || (b !== index && board[b] === val)) {
      return true;
    }
  }
  return false;
};

export default function GamesScreen() {
  const { t, isRTL } = useLanguage();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  // Menu state
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [bestTimes, setBestTimes] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardTab, setLeaderboardTab] = useState('Easy');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Game state
  const [inGame, setInGame] = useState(false);
  const [puzzleData, setPuzzleData] = useState(null); // { puzzle, solution }
  const [board, setBoard] = useState(() => new Array(81).fill(0));
  const [selectedCell, setSelectedCell] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState(null); // { time, isBest }

  // Refs mirror the latest values so background saves (interval, app
  // backgrounding, leaving the tab) always send current progress.
  const sessionRef = useRef(null);
  const boardRef = useRef(board);
  const elapsedRef = useRef(0);
  const playingRef = useRef(false);
  const completingRef = useRef(false);
  sessionRef.current = activeSession;
  boardRef.current = board;
  elapsedRef.current = elapsedSeconds;
  playingRef.current = inGame && timerRunning;

  const saveProgressSilently = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || completingRef.current) return;
    try {
      await api.put(`/api/sudoku/sessions/${session.id}/progress`, {
        cellState: boardRef.current.join(''),
        elapsedSeconds: elapsedRef.current,
      });
    } catch (err) {
      console.warn('Sudoku silent save failed', err?.message);
    }
  }, []);

  const loadBestTimes = useCallback(async () => {
    try {
      const res = await api.get('/api/sudoku/my-best');
      const dict = {};
      (res || []).forEach((item) => { dict[item.difficulty] = item.bestTimeSeconds; });
      setBestTimes(dict);
    } catch (err) {
      console.warn('Failed to load Sudoku best times', err?.message);
    }
  }, []);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api.get('/api/sudoku/sessions/active');
      if (session && session.id) {
        const puzzle = getSudokuPuzzle(session.difficulty, session.puzzleIndex);
        setActiveSession(session);
        setPuzzleData(puzzle);
        setBoard(boardForSession(session, puzzle));
        setElapsedSeconds(session.elapsedSeconds || 0);
      } else {
        setActiveSession(null);
        setPuzzleData(null);
      }
    } catch (err) {
      console.warn('Failed to load active Sudoku session', err?.message);
    }
    await loadBestTimes();
    setLoading(false);
  }, [loadBestTimes]);

  // Initial load; save progress when leaving the tab mid-game.
  useEffect(() => {
    loadMenu();
    return () => {
      if (playingRef.current) saveProgressSilently();
    };
  }, [loadMenu, saveProgressSilently]);

  // Leaderboard per difficulty tab.
  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    api.get(`/api/sudoku/leaderboard?difficulty=${leaderboardTab}`)
      .then((res) => { if (!cancelled) setLeaderboard(res || []); })
      .catch((err) => console.warn('Failed to load Sudoku leaderboard', err?.message))
      .finally(() => { if (!cancelled) setLeaderboardLoading(false); });
    return () => { cancelled = true; };
  }, [leaderboardTab, completion]);

  // Game timer.
  useEffect(() => {
    if (!timerRunning) return undefined;
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Periodic auto-save while playing.
  useEffect(() => {
    if (!inGame || !timerRunning) return undefined;
    const id = setInterval(saveProgressSilently, AUTO_SAVE_MS);
    return () => clearInterval(id);
  }, [inGame, timerRunning, saveProgressSilently]);

  // Pause the clock and save when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && playingRef.current) {
        setTimerRunning(false);
        saveProgressSilently();
      } else if (state === 'active' && inGame && !completingRef.current && !completion) {
        setTimerRunning(true);
      }
    });
    return () => sub.remove();
  }, [inGame, completion, saveProgressSilently]);

  const startNewGame = async (difficulty) => {
    if (activeSession) {
      Alert.alert(t('sudoku'), t('mustFinishFirst'));
      return;
    }
    setBusy(true);
    try {
      const session = await api.post('/api/sudoku/sessions', { difficulty });
      const puzzle = getSudokuPuzzle(session.difficulty, session.puzzleIndex);
      completingRef.current = false;
      setActiveSession(session);
      setPuzzleData(puzzle);
      setBoard(puzzle.puzzle.split('').map(Number));
      setElapsedSeconds(0);
      setSelectedCell(null);
      setInGame(true);
      setTimerRunning(true);
    } catch (err) {
      Alert.alert(t('Error'), errorMessage(err, t('gameActionFailed')));
    } finally {
      setBusy(false);
    }
  };

  const resumeGame = () => {
    if (!activeSession) return;
    completingRef.current = false;
    setSelectedCell(null);
    setInGame(true);
    setTimerRunning(true);
  };

  const pauseGame = async () => {
    setTimerRunning(false);
    setBusy(true);
    try {
      await api.put(`/api/sudoku/sessions/${activeSession.id}/progress`, {
        cellState: board.join(''),
        elapsedSeconds,
      });
      setInGame(false);
    } catch (err) {
      Alert.alert(t('Error'), errorMessage(err, t('gameActionFailed')));
      setTimerRunning(true);
    } finally {
      setBusy(false);
    }
  };

  const discardGame = () => {
    if (!activeSession) return;
    const wasRunning = timerRunning;
    setTimerRunning(false);
    Alert.alert(t('discardGame'), t('confirmDiscard'), [
      { text: t('cancel'), style: 'cancel', onPress: () => wasRunning && setTimerRunning(true) },
      {
        text: t('discardGame'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.delete(`/api/sudoku/sessions/${activeSession.id}`);
            setActiveSession(null);
            setPuzzleData(null);
            setBoard(new Array(81).fill(0));
            setSelectedCell(null);
            setElapsedSeconds(0);
            setInGame(false);
          } catch (err) {
            Alert.alert(t('Error'), errorMessage(err, t('gameActionFailed')));
            if (wasRunning) setTimerRunning(true);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const completeGame = async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setTimerRunning(false);
    const time = elapsedRef.current;
    setBusy(true);
    try {
      await api.put(`/api/sudoku/sessions/${activeSession.id}/complete`, { elapsedSeconds: time });
      const prevBest = bestTimes[activeSession.difficulty];
      setCompletion({ time, isBest: !prevBest || time < prevBest });
    } catch (err) {
      completingRef.current = false;
      setTimerRunning(true);
      Alert.alert(t('Error'), errorMessage(err, t('gameActionFailed')));
    } finally {
      setBusy(false);
    }
  };

  const handleInput = (value) => {
    if (selectedCell === null || !puzzleData || completingRef.current) return;
    if (puzzleData.puzzle[selectedCell] !== '0') return; // clue cell
    const next = [...board];
    next[selectedCell] = value;
    setBoard(next);
    if (isSolvedBoard(next, puzzleData.puzzle)) {
      completeGame();
    }
  };

  const closeCompletion = async () => {
    setCompletion(null);
    setActiveSession(null);
    setPuzzleData(null);
    setSelectedCell(null);
    setElapsedSeconds(0);
    setInGame(false);
    completingRef.current = false;
    await loadMenu();
  };

  // ── Rendering ──
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const gridSize = Math.min(width - 32, 460);
  const cellSize = Math.floor((gridSize - 6) / 9);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const renderBoard = () => {
    const selRow = selectedCell !== null ? Math.floor(selectedCell / 9) : -1;
    const selCol = selectedCell !== null ? selectedCell % 9 : -1;
    const selVal = selectedCell !== null ? board[selectedCell] : 0;

    return (
      <View style={[styles.grid, { borderColor: theme.text, width: cellSize * 9 + 6 }]}>
        {Array.from({ length: 9 }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {Array.from({ length: 9 }).map((__, col) => {
              const idx = row * 9 + col;
              const val = board[idx];
              const isClue = puzzleData.puzzle[idx] !== '0';
              const isSelected = idx === selectedCell;
              const isPeer = selectedCell !== null && (
                row === selRow || col === selCol ||
                (Math.floor(row / 3) === Math.floor(selRow / 3) && Math.floor(col / 3) === Math.floor(selCol / 3))
              );
              const isSame = !isSelected && val !== 0 && val === selVal;
              const conflict = hasConflict(board, idx);

              let bg = theme.cardBackground;
              if (isPeer) bg = theme.primary + '14';
              if (isSame) bg = theme.primary + '33';
              if (isSelected) bg = theme.primary + '55';
              if (conflict && !isClue) bg = DANGER + '26';

              let color = isClue ? theme.text : theme.primary;
              if (conflict) color = DANGER;

              return (
                <TouchableOpacity
                  key={col}
                  activeOpacity={0.6}
                  onPress={() => setSelectedCell(idx)}
                  accessibilityLabel={`Row ${row + 1}, column ${col + 1}${val ? `, ${val}` : ''}`}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: bg,
                      borderColor: theme.border,
                      borderRightWidth: col === 2 || col === 5 ? 2 : StyleSheet.hairlineWidth,
                      borderRightColor: col === 2 || col === 5 ? theme.text : theme.border,
                      borderBottomWidth: row === 2 || row === 5 ? 2 : StyleSheet.hairlineWidth,
                      borderBottomColor: row === 2 || row === 5 ? theme.text : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color,
                      fontSize: cellSize * 0.5,
                      fontWeight: isClue ? '800' : '600',
                    }}
                  >
                    {val !== 0 ? val : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderGame = () => {
    const diff = DIFFICULTIES.find((d) => d.key === activeSession.difficulty) || DIFFICULTIES[0];
    const selectedIsClue = selectedCell !== null && puzzleData.puzzle[selectedCell] !== '0';
    const padDisabled = selectedCell === null || selectedIsClue || busy;
    const padSize = Math.floor((gridSize - 8 * 4) / 5);

    return (
      <ScrollView contentContainerStyle={styles.gameContainer}>
        <View style={[styles.gameHeader, { flexDirection: rowDir, width: gridSize }]}>
          <View style={[styles.badge, { backgroundColor: diff.color + '22', borderColor: diff.color }]}>
            <Text style={[styles.badgeText, { color: diff.color }]}>{t(diff.key.toLowerCase())}</Text>
          </View>
          <View style={[styles.timer, { flexDirection: rowDir }]}>
            <Ionicons name="time-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.timerText, { color: theme.text }]}>{formatTime(elapsedSeconds)}</Text>
          </View>
          <View style={{ flexDirection: rowDir, gap: 8 }}>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: theme.border, backgroundColor: theme.cardBackground }]}
              onPress={pauseGame}
              disabled={busy}
              accessibilityLabel={t('pauseGame')}
            >
              <Ionicons name="pause" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: DANGER, backgroundColor: DANGER + '10' }]}
              onPress={discardGame}
              disabled={busy}
              accessibilityLabel={t('discardGame')}
            >
              <Ionicons name="trash-outline" size={18} color={DANGER} />
            </TouchableOpacity>
          </View>
        </View>

        {renderBoard()}

        <View style={[styles.pad, { width: gridSize }]}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <TouchableOpacity
              key={n}
              disabled={padDisabled}
              onPress={() => handleInput(n)}
              style={[
                styles.padBtn,
                { width: padSize, height: padSize * 0.8, backgroundColor: theme.cardBackground, borderColor: theme.border, opacity: padDisabled ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.padText, { color: theme.text }]}>{n}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            disabled={padDisabled}
            onPress={() => handleInput(0)}
            accessibilityLabel={t('erase')}
            style={[
              styles.padBtn,
              { width: padSize, height: padSize * 0.8, backgroundColor: DANGER + '1a', borderColor: DANGER + '33', opacity: padDisabled ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="backspace-outline" size={22} color={DANGER} />
          </TouchableOpacity>
        </View>
        {busy && <ActivityIndicator style={{ marginTop: 12 }} color={theme.primary} />}
      </ScrollView>
    );
  };

  const renderMenu = () => (
    <ScrollView contentContainerStyle={styles.menuContainer}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="game-controller" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text, textAlign }]}>{t('sudoku')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign }]}>{t('sudokuTagline')}</Text>
        </View>
      </View>

      {activeSession && (
        <View style={[styles.card, styles.resumeCard, { backgroundColor: theme.warningBg, borderColor: theme.warningBorder }]}>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 12 }}>
            <Ionicons name="time-outline" size={28} color={theme.warningText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text, textAlign }]}>{t('youHavePausedGame')}</Text>
              <Text style={{ color: theme.textSecondary, textAlign }}>
                {t(activeSession.difficulty.toLowerCase())} • {t('elapsed')}: {formatTime(elapsedSeconds)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: rowDir, gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary, flex: 1, flexDirection: rowDir }]}
              onPress={resumeGame}
              disabled={busy}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('continueGame')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: DANGER, backgroundColor: DANGER + '10', height: 44, width: 44 }]}
              onPress={discardGame}
              disabled={busy}
              accessibilityLabel={t('discardGame')}
            >
              <Ionicons name="trash-outline" size={18} color={DANGER} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: theme.text, textAlign }]}>{t('startNewSession')}</Text>
      {DIFFICULTIES.map((d) => {
        const disabled = !!activeSession || busy;
        return (
          <View
            key={d.key}
            style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, opacity: activeSession ? 0.55 : 1 }]}
          >
            <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 12 }}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.text, textAlign }]}>{t(d.key.toLowerCase())}</Text>
                <Text style={{ color: theme.textSecondary, textAlign, fontSize: 13 }}>{t(d.descKey)}</Text>
              </View>
              <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('personalBest')}</Text>
                <Text style={{ color: d.color, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {bestTimes[d.key] ? formatTime(bestTimes[d.key]) : '--:--'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: d.color, marginTop: 12 }]}
              disabled={disabled}
              onPress={() => startNewGame(d.key)}
            >
              <Text style={styles.primaryBtnText}>{t('startGame')}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border, marginTop: 8 }]}>
        <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name="trophy" size={20} color="#f59e0b" />
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('leaderboard')}</Text>
        </View>
        <View style={[styles.tabs, { flexDirection: rowDir, backgroundColor: theme.background }]}>
          {DIFFICULTIES.map((d) => {
            const active = leaderboardTab === d.key;
            return (
              <TouchableOpacity
                key={d.key}
                style={[styles.tab, active && { backgroundColor: theme.primary }]}
                onPress={() => setLeaderboardTab(d.key)}
              >
                <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '600' }}>{t(d.key.toLowerCase())}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {leaderboardLoading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} />
        ) : leaderboard.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="help-circle-outline" size={32} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, marginTop: 6 }}>{t('noScoresYet')}</Text>
          </View>
        ) : (
          leaderboard.map((entry) => {
            const medal = entry.rank === 1 ? '#facc15' : entry.rank === 2 ? '#cbd5e1' : entry.rank === 3 ? '#cd7f32' : theme.textSecondary;
            return (
              <View key={entry.rank} style={[styles.lbRow, { flexDirection: rowDir, borderColor: theme.border }]}>
                <Text style={[styles.lbRank, { color: medal }]}>#{entry.rank}</Text>
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.avatarText}>{entry.userName ? entry.userName[0].toUpperCase() : 'P'}</Text>
                </View>
                <Text style={[styles.lbName, { color: theme.text, textAlign }]} numberOfLines={1}>{entry.userName}</Text>
                <Text style={[styles.lbTime, { color: theme.primary }]}>{formatTime(entry.timeSeconds)}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {inGame && activeSession && puzzleData ? renderGame() : renderMenu()}

      <Modal visible={!!completion} transparent animationType="fade" onRequestClose={closeCompletion}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            <Ionicons name={completion?.isBest ? 'trophy' : 'checkmark-circle'} size={56} color={completion?.isBest ? '#f59e0b' : '#10b981'} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {completion?.isBest ? t('newPersonalBest') : t('congratulations')}
            </Text>
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('puzzleSolvedIn')}</Text>
            <Text style={[styles.modalTime, { color: theme.primary }]}>{formatTime(completion?.time)}</Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary, alignSelf: 'stretch' }]} onPress={closeCompletion}>
              <Text style={styles.primaryBtnText}>{t('backToMenu')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AdInterstitial pageKey="sudoku" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  menuContainer: { padding: 16, paddingBottom: 32 },
  header: { alignItems: 'center', gap: 14, marginBottom: 20 },
  headerIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  resumeCard: { marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  primaryBtn: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  iconBtn: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { borderRadius: 10, padding: 4, gap: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 28 },
  lbRow: { alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  lbRank: { width: 32, fontWeight: '800' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  lbName: { flex: 1, fontWeight: '600' },
  lbTime: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  gameContainer: { alignItems: 'center', padding: 16, paddingBottom: 32 },
  gameHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontWeight: '700', fontSize: 13 },
  timer: { alignItems: 'center', gap: 6 },
  timerText: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  grid: { borderWidth: 3, borderRadius: 10, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, justifyContent: 'center' },
  padBtn: { borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  padText: { fontSize: 22, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  modalTime: { fontSize: 32, fontWeight: '800', marginVertical: 8, fontVariant: ['tabular-nums'] },
});
