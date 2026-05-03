import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../services/firebase';
import {
  saveGoal,
  saveGoalLog,
  updateGoalProgress,
  deleteGoalWithLogs as deleteGoal,
  Goal,
  GoalLog,
} from '../../services/firestoreService';

type GoalLogWithGoal = GoalLog & { goalId: string };
type GoalSummary = {
  goal: Goal;
  completed: number;
  remaining: number;
  progress: number;
  statusLabel: string;
  statusColor: string;
  chipBg: string;
  currentStreak: number;
  bestStreak: number;
  feedback: string;
  goalType: string;
  logsCount: number;
};

const GOAL_TYPES = ['km', 'calories', 'minutes', 'workouts', 'kg'];

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  return new Date(value);
};

const dayKey = (value: any) => {
  const d = toDate(value);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
};

const formatNumber = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
};

const goalIcon = (type: string) => {
  if (type === 'calories') return 'flame-outline';
  if (type === 'minutes' || type === 'km') return 'walk-outline';
  if (type === 'kg') return 'scale-outline';
  return 'trophy-outline';
};

const AnimatedProgressBar = ({ progress, color }: { progress: number; color: string }) => {
  const anim = useState(new Animated.Value(0))[0];
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, progress]);

  const fill = anim.interpolate({ inputRange: [0, 1], outputRange: [0, width] });

  return (
    <View style={styles.barBg} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.barFill, { width: fill as any, backgroundColor: color }]} />
    </View>
  );
};

export default function GoalsScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [logsByGoal, setLogsByGoal] = useState<Record<string, GoalLogWithGoal[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [goalToDelete, setGoalToDelete] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState('km');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [logValue, setLogValue] = useState('');
  const [logNote, setLogNote] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!uid) {
      setGoals([]);
      setLogsByGoal({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    const unsubscribers: Array<() => void> = [];

    const unsubGoals = onSnapshot(collection(db, 'goals'), (snap) => {
      const nextGoals = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Goal))
        .filter((goal) => goal.uid === uid)
        .sort((a, b) => {
          const aDate = toDate(a.deadline)?.getTime() ?? 0;
          const bDate = toDate(b.deadline)?.getTime() ?? 0;
          return aDate - bDate;
        });
      setGoals(nextGoals);
      setLogsByGoal({});
      unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      nextGoals.forEach((goal) => {
        const logsQuery = query(collection(db, 'goals', goal.id!, 'logs'), orderBy('date', 'desc'));
        const unsub = onSnapshot(logsQuery, (logSnap) => {
          setLogsByGoal((prev) => ({
            ...prev,
            [goal.id!]: logSnap.docs.map((d) => ({ id: d.id, goalId: goal.id!, ...d.data() } as GoalLogWithGoal)),
          }));
        }, () => {
          Alert.alert('Error', 'Could not load goal logs.');
        });
        unsubscribers.push(unsub);
      });
      setLoading(false);
      setRefreshing(false);
    }, () => {
      Alert.alert('Error', 'Could not load goals.');
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      unsubGoals();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid]);

  const summaries = useMemo<GoalSummary[]>(() => {
    const now = new Date();
    return goals.map((goal) => {
      const goalLogs = logsByGoal[goal.id ?? ''] ?? [];
      const completed = goalLogs.reduce((sum, log) => sum + (Number(log.value) || 0), 0);
      const progress = goal.target > 0 ? Math.min(completed / goal.target, 1) : 0;
      const remaining = Math.max(goal.target - completed, 0);
      const typeValue = (goal.type ?? goal.unit ?? 'workouts').toLowerCase();

      const createdAt = toDate(goal.createdAt) ?? now;
      const deadlineDate = toDate(goal.deadline) ?? now;
      const totalDays = Math.max(1, Math.ceil((deadlineDate.getTime() - createdAt.getTime()) / 86400000));
      const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - createdAt.getTime()) / 86400000)));
      const expected = Math.min(1, elapsed / totalDays);

      let statusLabel = 'Behind';
      let statusColor = '#EF4444';
      let chipBg = '#FEE2E2';
      if (progress >= 1) {
        statusLabel = 'Completed';
        statusColor = '#1D9E75';
        chipBg = '#E1F5EE';
      } else if (progress >= expected) {
        statusLabel = 'On track';
        statusColor = '#F59E0B';
        chipBg = '#FDE68A';
      }

      const uniqueDays = Array.from(new Set(goalLogs.map((log) => dayKey(log.date)))).filter(Boolean).sort();
      const daySet = new Set(uniqueDays);
      let currentStreak = 0;
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      while (daySet.has(cursor.toISOString().slice(0, 10))) {
        currentStreak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      let bestStreak = 0;
      let streak = 0;
      let prev: Date | null = null;
      uniqueDays.forEach((key) => {
        const d = new Date(key);
        if (!prev) streak = 1;
        else {
          const diff = Math.round((prev.getTime() - d.getTime()) / 86400000);
          streak = diff === 1 ? streak + 1 : 1;
        }
        bestStreak = Math.max(bestStreak, streak);
        prev = d;
      });

      const feedback = progress >= 1
        ? 'Goal completed. Great work.'
        : progress >= 0.5
          ? "You're ahead of schedule"
          : `You need ${formatNumber(remaining)} more ${typeValue} to reach your goal.`;

      return {
        goal,
        completed,
        remaining,
        progress,
        statusLabel,
        statusColor,
        chipBg,
        currentStreak,
        bestStreak,
        feedback,
        goalType: typeValue,
        logsCount: goalLogs.length,
      };
    });
  }, [goals, logsByGoal]);

  const handleAddGoal = async () => {
    if (!uid) {
      Alert.alert('Error', 'Please sign in again.');
      return;
    }
    if (!title || !target || !deadline) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    setSaving(true);
    try {
      await saveGoal({ uid, title: title.trim(), target: parseFloat(target), current: 0, unit: type, type, deadline: deadline!, createdAt: new Date() });
      setShowAddModal(false);
      setTitle('');
      setTarget('');
      setType('km');
      setDeadline(null);
    } catch {
      Alert.alert('Error', 'Could not save goal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDateSelect = (day: number) => {
    if (deadline) {
      const newDate = new Date(deadline);
      newDate.setDate(day);
      setDeadline(newDate);
      setShowDatePicker(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const openGoal = (goalId: string) => router.push((`/goal/${goalId}`) as any);
  

  const handleSaveLog = async () => {
    if (!uid || !selectedGoal) return;
    const valueNum = parseFloat(logValue);
    if (!valueNum || valueNum <= 0) {
      Alert.alert('Error', 'Please enter a valid value.');
      return;
    }

    const summary = summaries.find((item) => item.goal.id === selectedGoal.id);
    const newCompleted = (summary?.completed ?? 0) + valueNum;

    setSaving(true);
    try {
      const now = new Date();
      const localLog: GoalLogWithGoal = {
        id: `local-${Date.now()}`,
        goalId: selectedGoal.id!,
        uid,
        value: valueNum,
        note: logNote.trim(),
        date: now,
      };
      await saveGoalLog(selectedGoal.id!, { uid, value: valueNum, note: logNote.trim(), date: new Date() });
      await updateGoalProgress(selectedGoal.id!, newCompleted);
      setLogsByGoal((prev) => ({
        ...prev,
        [selectedGoal.id!]: [localLog, ...(prev[selectedGoal.id!] ?? [])],
      }));
      setShowLogModal(false);
      setSelectedGoal(null);
      setLogValue('');
      setLogNote('');
    } catch {
      Alert.alert('Error', 'Could not save progress log.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteGoal = (goalId?: string, title?: string) => {
    if (!goalId) return;
    setGoalToDelete({ id: goalId, title: title ?? '' });
    setShowDeleteModal(true);
  };

  const handleDeleteGoal = async () => {
    if (!goalToDelete) return;
    setSaving(true);
    try {
      await deleteGoal(goalToDelete.id);
      setGoals((prev) => prev.filter((g) => g.id !== goalToDelete.id));
      setLogsByGoal((prev) => {
        const copy = { ...prev };
        delete copy[goalToDelete.id];
        return copy;
      });
      setShowDeleteModal(false);
      setGoalToDelete(null);
    } catch (err) {
      console.error('Delete goal failed', err);
      const message = (err as any)?.message || String(err);
      Alert.alert('Error', `Could not delete goal: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Goal Tracker</Text>
          <Text style={styles.headerSub}>
            {summaries.length} active goal{summaries.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>+ Add goal</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor="#1D9E75" />}
        showsVerticalScrollIndicator={false}
      >
        {summaries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="flag-outline" size={40} color="#1D9E75" />
            </View>
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptySub}>Tap "Add goal" to set your first fitness goal</Text>
          </View>
        ) : (
          summaries.map((item) => (
            <Pressable key={item.goal.id} style={styles.card} onPress={() => openGoal(item.goal.id!)}>
                      <View style={styles.cardTop}>
                        <View style={styles.iconWrap}>
                          <Ionicons name={goalIcon(item.goalType) as any} size={18} color={item.statusColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.cardTitle}>{item.goal.title}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={[styles.statusChip, { backgroundColor: item.chipBg }]}> 
                                <Text style={[styles.statusText, { color: item.statusColor }]}>{item.statusLabel}</Text>
                              </View>
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  e?.stopPropagation?.();
                                  confirmDeleteGoal(item.goal.id, item.goal.title);
                                }}
                                style={{ marginLeft: 8, opacity: saving ? 0.6 : 1 }}
                                disabled={saving}
                              >
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <Text style={styles.cardMeta}>
                            Deadline: {toDate(item.goal.deadline)?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Text>
                          <Text style={styles.cardMetaMuted}>{item.feedback}</Text>
                        </View>
                      </View>

              <AnimatedProgressBar progress={item.progress} color={item.statusColor} />

              <View style={styles.metricsRow}>
                <View>
                  <Text style={styles.metricLabel}>Completed</Text>
                  <Text style={styles.metricValue}>
                    {formatNumber(item.completed)} / {item.goal.target} {item.goal.unit ?? item.goal.type}
                  </Text>
                </View>
                <Text style={[styles.percentText, { color: item.statusColor }]}>{Math.round(item.progress * 100)}%</Text>
              </View>

              <View style={styles.streakRow}>
                <View style={styles.streakChip}>
                  <Text style={styles.streakText}>🔥 {item.currentStreak} day streak</Text>
                </View>
                <View style={styles.streakChipAlt}>
                  <Text style={styles.streakTextAlt}>Best {item.bestStreak}</Text>
                </View>
                <View style={styles.streakChipAlt}>
                  <Text style={styles.streakTextAlt}>{item.logsCount} logs</Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Add Goal Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modal} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.modalTitle}>New Goal</Text>
            <Text style={styles.modalSub}>Set a target and track your progress daily.</Text>

            <Text style={styles.label}>Goal Title</Text>
            <TextInput style={styles.input} placeholder="e.g. Run 50km this month" placeholderTextColor="#A0AEC0" value={title} onChangeText={setTitle} />

            <Text style={styles.label}>Target Amount</Text>
            <TextInput style={styles.input} placeholder="e.g. 50" placeholderTextColor="#A0AEC0" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {GOAL_TYPES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.typeChip, type === item && styles.typeChipActive]}
                  onPress={() => setType(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeText, type === item && styles.typeTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Deadline</Text>
            <TouchableOpacity style={styles.deadlineBtn} onPress={() => {
              if (!deadline) setDeadline(new Date());
              setShowDatePicker(!showDatePicker);
            }}>
              <Ionicons name="calendar-outline" size={18} color="#1D9E75" />
              <Text style={styles.deadlineBtnText}>{deadline ? deadline.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Select date'}</Text>
            </TouchableOpacity>

            {showDatePicker && deadline && (
              <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => {
                    const newDate = new Date(deadline);
                    newDate.setMonth(newDate.getMonth() - 1);
                    setDeadline(newDate);
                  }}>
                    <Ionicons name="chevron-back" size={20} color="#1D9E75" />
                  </TouchableOpacity>
                  <Text style={styles.calendarTitle}>{deadline.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</Text>
                  <TouchableOpacity onPress={() => {
                    const newDate = new Date(deadline);
                    newDate.setMonth(newDate.getMonth() + 1);
                    setDeadline(newDate);
                  }}>
                    <Ionicons name="chevron-forward" size={20} color="#1D9E75" />
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarWeekDays}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <Text key={day} style={styles.weekDayText}>{day}</Text>
                  ))}
                </View>
                <View style={styles.calendarDays}>
                  {Array.from({ length: getFirstDayOfMonth(deadline) }).map((_, i) => (
                    <View key={`empty-${i}`} style={styles.calendarDay} />
                  ))}
                  {Array.from({ length: getDaysInMonth(deadline) }).map((_, i) => (
                    <TouchableOpacity
                      key={i + 1}
                      style={[
                        styles.calendarDay,
                        deadline.getDate() === i + 1 && styles.calendarDaySelected,
                      ]}
                      onPress={() => handleDateSelect(i + 1)}
                    >
                      <Text style={[styles.calendarDayText, deadline.getDate() === i + 1 && styles.calendarDayTextSelected]}>
                        {i + 1}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddModal(false); setShowDatePicker(false); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleAddGoal} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Goal</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Log Progress Modal */}
      <Modal visible={showLogModal} transparent animationType="slide" onRequestClose={() => setShowLogModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Log Progress</Text>
            <Text style={styles.modalSub}>{selectedGoal?.title}</Text>

            <Text style={styles.label}>Value</Text>
            <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor="#A0AEC0" value={logValue} onChangeText={setLogValue} keyboardType="decimal-pad" />

            <Text style={styles.label}>Optional note</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="How did it go?" placeholderTextColor="#A0AEC0" value={logNote} onChangeText={setLogNote} multiline />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowLogModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveLog} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save log</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.confirmModal}>
            <View style={styles.deleteIconCircle}>
              <Ionicons name="trash" size={32} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Delete Goal?</Text>
            <Text style={styles.confirmSub}>
              Are you sure you want to delete "{goalToDelete?.title}"? This action cannot be undone and all progress logs will be lost.
            </Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity 
                style={styles.confirmCancelBtn} 
                onPress={() => setShowDeleteModal(false)}
                disabled={saving}
              >
                <Text style={styles.confirmCancelText}>Keep it</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmDeleteBtn, saving && styles.saveBtnDisabled]} 
                onPress={handleDeleteGoal}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 15,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  headerSub: {
    fontSize: 13,
    color: '#718096',
    marginTop: 3,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  addBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 90 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    marginBottom: 6,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  emptySub: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetweenContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetweenLeft: { flex: 1 },
  rowBetweenRight: { alignItems: 'flex-end' },
  rowBetweenSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  cardMeta: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  cardMetaMuted: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 3,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  barBg: { height: 6, backgroundColor: '#EDF2F7', borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  barFill: { height: 6, borderRadius: 999 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 },
  metricLabel: {
    fontSize: 12,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A202C',
    marginTop: 3,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  percentText: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  streakRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  streakChip: { backgroundColor: '#E1F5EE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  streakChipAlt: { backgroundColor: '#EDF2F7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F6E56',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  streakTextAlt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A5568',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  modalSub: {
    fontSize: 13,
    color: '#718096',
    marginTop: 4,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 6,
    marginTop: 14,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  input: {
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1A202C',
    backgroundColor: '#F7FAFC',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  typeChip: {
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F7FAFC',
  },
  typeChipActive: { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  typeText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  typeTextActive: { color: '#FFFFFF' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  saveBtnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  saveText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  deleteIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Montserrat', android: 'sans-serif-medium' }),
  },
  confirmSub: {
    fontSize: 13,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 10,
    fontFamily: Platform.select({ ios: 'Poppins', android: 'sans-serif' }),
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    fontFamily: Platform.select({ ios: 'Poppins', android: 'sans-serif' }),
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'Montserrat', android: 'sans-serif-medium' }),
  },
  deadlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#F7FAFC',
    gap: 10,
  },
  deadlineBtnText: {
    fontSize: 14,
    color: '#1A202C',
    fontWeight: '500',
    fontFamily: Platform.select({ ios: 'Poppins', android: 'sans-serif' }),
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({ ios: 'Montserrat', android: 'sans-serif-medium' }),
  },
  calendarWeekDays: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#718096',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  calendarDaySelected: {
    backgroundColor: '#1D9E75',
    borderRadius: 8,
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A5568',
    fontFamily: Platform.select({ ios: 'Poppins', android: 'sans-serif' }),
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});