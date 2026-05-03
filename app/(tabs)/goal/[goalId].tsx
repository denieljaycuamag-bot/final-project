import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import {
  getGoalById,
  saveGoalLog,
  updateGoal,
  updateGoalProgress,
  Goal,
  GoalLog,
} from '@/services/firestoreService';
import { chatWithAI } from '@/services/openrouter';

type GoalLogWithId = GoalLog & { id: string };

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

const getGoalIcon = (type: string) => {
  if (type === 'km' || type === 'minutes') return 'walk-outline';
  if (type === 'calories') return 'flame-outline';
  if (type === 'kg') return 'scale-outline';
  return 'trophy-outline';
};

const AnimatedProgressBar = ({ progress, color }: { progress: number; color: string }) => {
  const animated = useState(new Animated.Value(0))[0];
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: progress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animated, progress]);

  const fillWidth = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [0, barWidth],
  });

  return (
    <View style={styles.barBg} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.barFill, { width: fillWidth as any, backgroundColor: color }]} />
    </View>
  );
};

export default function GoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goalId: string }>();
  const goalId = typeof params.goalId === 'string' ? params.goalId : '';

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [logs, setLogs] = useState<GoalLogWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAIFeedback, setShowAIFeedback] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [type, setType] = useState('km');
  const [deadline, setDeadline] = useState('');
  const [logValue, setLogValue] = useState('');
  const [logNote, setLogNote] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!uid || !goalId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const goalRef = doc(db, 'goals', goalId);
    const logsQuery = query(collection(db, 'goals', goalId, 'logs'), orderBy('date', 'desc'));

    const unsubscribeGoal = onSnapshot(
      goalRef,
      (snap) => {
        if (!snap.exists()) {
          setGoal(null);
          setLoading(false);
          return;
        }
        const nextGoal = { id: snap.id, ...snap.data() } as Goal;
        setGoal(nextGoal);
        setTitle(nextGoal.title ?? '');
        setTarget(String(nextGoal.target ?? ''));
        setType((nextGoal.type ?? nextGoal.unit ?? 'km').toString());
        const d = toDate(nextGoal.deadline);
        setDeadline(d ? d.toISOString().slice(0, 10) : '');
        setLoading(false);
      },
      () => {
        Alert.alert('Error', 'Could not load goal.');
        setLoading(false);
      }
    );

    const unsubscribeLogs = onSnapshot(
      logsQuery,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoalLogWithId)));
      },
      () => {
        Alert.alert('Error', 'Could not load goal activity.');
      }
    );

    return () => {
      unsubscribeGoal();
      unsubscribeLogs();
    };
  }, [goalId, uid]);

  const stats = useMemo(() => {
    if (!goal) {
      return null;
    }

    const completed = logs.reduce((sum, log) => sum + (Number(log.value) || 0), 0);
    const remaining = Math.max(goal.target - completed, 0);
    const progress = goal.target > 0 ? Math.min(completed / goal.target, 1) : 0;
    const goalType = (goal.type ?? goal.unit ?? 'workouts').toLowerCase();

    const uniqueDays = Array.from(new Set(logs.map((log) => dayKey(log.date)))).filter(Boolean).sort();
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

    const statusColor = progress >= 1 ? '#1D9E75' : progress >= 0.5 ? '#F59E0B' : '#EF4444';
    const statusLabel = progress >= 1 ? 'Completed' : progress >= 0.5 ? 'On track' : 'Behind';
    const expectedRemaining = Math.max(goal.target - completed, 0);
    const feedback = progress >= 1
      ? 'Goal completed. Great work.'
      : progress >= 0.5
        ? "You're ahead of schedule"
        : `You need ${formatNumber(expectedRemaining)} more ${goalType} to reach your goal.`;

    return {
      completed,
      remaining,
      progress,
      currentStreak,
      bestStreak,
      statusColor,
      statusLabel,
      feedback,
      goalType,
    };
  }, [goal, logs]);

  const handleSaveEdit = async () => {
    if (!goal || !uid) return;
    if (!title || !target || !deadline) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      Alert.alert('Error', 'Invalid deadline. Use format: YYYY-MM-DD');
      return;
    }

    setSaving(true);
    try {
      await updateGoal(goal.id!, {
        title: title.trim(),
        target: parseFloat(target),
        unit: type,
        type,
        deadline: deadlineDate,
      });
      setShowEditModal(false);
    } catch {
      Alert.alert('Error', 'Could not update goal.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLog = async () => {
    if (!goal || !uid || !stats) return;
    const valueNum = parseFloat(logValue);
    if (!valueNum || valueNum <= 0) {
      Alert.alert('Error', 'Please enter a valid value.');
      return;
    }

    setSaving(true);
    try {
      await saveGoalLog(goal.id!, {
        uid,
        value: valueNum,
        note: logNote.trim(),
        date: new Date(),
      });
      await updateGoalProgress(goal.id!, stats.completed + valueNum);
      setGoal((prev) => (prev ? { ...prev, current: (prev.current ?? 0) + valueNum } : prev));
      setShowLogModal(false);
      setLogValue('');
      setLogNote('');

      // Generate AI feedback if it's a calorie goal
      if ((goal.type ?? goal.unit) === 'calories') {
        const newTotal = stats.completed + valueNum;
        const goalType = (goal.type ?? goal.unit ?? 'calories').toLowerCase();
        const systemPrompt = `You are a friendly fitness coach. The user just logged ${valueNum} calories. Their total for this goal is now ${newTotal}/${goal.target} calories. 
        Generate a SHORT (1-2 sentences), motivating message about their calorie intake. 
        Include: current total calories logged, remaining calories to goal, and an encouraging comment about their progress.
        Keep it concise and friendly!`;
        
        const feedback = await chatWithAI([{ role: 'user', content: `I just logged ${valueNum} calories. My new total is ${newTotal} calories. My goal is ${goal.target} calories.` }], systemPrompt);
        setAiFeedback(feedback);
        setShowAIFeedback(true);
        
        // Auto-close feedback after 5 seconds
        setTimeout(() => setShowAIFeedback(false), 5000);
      }
    } catch {
      Alert.alert('Error', 'Could not save progress log.');
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

  if (!goal) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missingTitle}>Goal not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/goals')} activeOpacity={0.85}>
          <Text style={styles.backText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIconBtn} onPress={() => router.replace('/goals')} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color="#1A202C" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Goal Details</Text>
          <Text style={styles.headerSub}>Track your progress and activity history</Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setShowEditModal(true)} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={18} color="#1D9E75" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.iconWrap}>
              <Ionicons name={getGoalIcon(stats?.goalType ?? 'workouts') as any} size={20} color={stats?.statusColor ?? '#1D9E75'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>{goal.title}</Text>
              <Text style={styles.heroMeta}>
                Deadline: {toDate(goal.deadline)?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: stats?.statusColor === '#EF4444' ? '#FEE2E2' : '#E1F5EE' }]}>
              <Text style={[styles.statusBadgeText, { color: stats?.statusColor ?? '#1D9E75' }]}>{stats?.statusLabel}</Text>
            </View>
          </View>

          <AnimatedProgressBar progress={stats?.progress ?? 0} color={stats?.statusColor ?? '#1D9E75'} />

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Completed</Text>
              <Text style={styles.statValue}>
                {formatNumber(stats?.completed ?? 0)} / {goal.target} {goal.unit ?? goal.type}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Progress</Text>
              <Text style={styles.statValue}>{Math.round((stats?.progress ?? 0) * 100)}%</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Current streak</Text>
              <Text style={styles.statValue}>🔥 {stats?.currentStreak ?? 0} days</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Best streak</Text>
              <Text style={styles.statValue}>{stats?.bestStreak ?? 0} days</Text>
            </View>
          </View>

          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{stats?.feedback}</Text>
            {stats?.remaining ? (
              <Text style={styles.feedbackSub}>You need {formatNumber(stats.remaining)} more {stats.goalType} to reach your goal.</Text>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowLogModal(true)} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={18} color="#0F6E56" />
              <Text style={styles.secondaryBtnText}>Log Progress</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity History</Text>
          <Text style={styles.sectionSub}>{logs.length} logs</Text>
        </View>

        {logs.length === 0 ? (
          <View style={styles.emptyHistory}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="document-text-outline" size={36} color="#718096" />
            </View>
            <Text style={styles.emptyHistoryText}>No logs yet. Start by logging your progress.</Text>
          </View>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logTop}>
                <Text style={styles.logValue}>
                  {formatNumber(Number(log.value) || 0)} {goal.unit ?? goal.type}
                </Text>
                <Text style={styles.logDate}>
                  {toDate(log.date)?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              {log.note ? <Text style={styles.logNote}>{log.note}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Edit Goal Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit goal</Text>
            <Text style={styles.modalSub}>Update the target, type, or deadline.</Text>

            <Text style={styles.label}>Goal title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor="#A0AEC0" />

            <Text style={styles.label}>Target amount</Text>
            <TextInput style={styles.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholderTextColor="#A0AEC0" />

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

            <Text style={styles.label}>Deadline (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={deadline} onChangeText={setDeadline} placeholderTextColor="#A0AEC0" />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveEdit} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Log Progress Modal */}
      <Modal visible={showLogModal} transparent animationType="slide" onRequestClose={() => setShowLogModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Log Progress</Text>
            <Text style={styles.modalSub}>{goal.title}</Text>
            <Text style={styles.helperText}>
              Enter the amount you actually finished today. Example: 5 km, 20 minutes, 10 reps, or 1 workout.
            </Text>

            <Text style={styles.label}>Value</Text>
            <TextInput style={styles.input} value={logValue} onChangeText={setLogValue} keyboardType="decimal-pad" placeholder="e.g. 5" placeholderTextColor="#A0AEC0" />

            <Text style={styles.label}>Optional note</Text>
            <TextInput style={[styles.input, styles.textArea]} value={logNote} onChangeText={setLogNote} multiline placeholder="How did it go?" placeholderTextColor="#A0AEC0" />

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

      {/* AI Feedback Modal */}
      <Modal visible={showAIFeedback} transparent animationType="fade" onRequestClose={() => setShowAIFeedback(false)}>
        <View style={styles.aiModalOverlay}>
          <View style={styles.aiFeedbackCard}>
            <View style={styles.aiFeedbackHeader}>
              <Ionicons name="sparkles" size={20} color="#1D9E75" />
              <Text style={styles.aiFeedbackTitle}>Calorie Insight</Text>
              <Ionicons name="sparkles" size={20} color="#1D9E75" />
            </View>
            <Text style={styles.aiFeedbackText}>{aiFeedback}</Text>
            <TouchableOpacity style={styles.aiCloseBtn} onPress={() => setShowAIFeedback(false)} activeOpacity={0.8}>
              <Text style={styles.aiCloseBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  missingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A202C',
    marginBottom: 16,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  backBtn: {
    backgroundColor: '#1D9E75',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  backText: { color: '#FFFFFF', fontWeight: '600' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 15,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 2,
  },
  backIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  headerSub: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E1F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: 16, paddingBottom: 48 },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  heroMeta: {
    fontSize: 12,
    color: '#718096',
    marginTop: 3,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  barBg: { height: 6, backgroundColor: '#EDF2F7', borderRadius: 999, overflow: 'hidden', marginTop: 16 },
  barFill: { height: 6, borderRadius: 999 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  statBox: {
    width: '48%',
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  statLabel: {
    fontSize: 12,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A202C',
    marginTop: 4,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  feedbackBox: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#EDF2F7',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F6E56',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  feedbackSub: {
    fontSize: 11,
    color: '#065F46',
    marginTop: 4,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EDF2F7',
    borderRadius: 10,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F6E56',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 24, marginBottom: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  sectionSub: {
    fontSize: 13,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  emptyHistory: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  logValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  logDate: {
    fontSize: 12,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  logNote: {
    fontSize: 13,
    color: '#4A5568',
    marginTop: 8,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
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
  helperText: {
    fontSize: 12,
    color: '#4A5568',
    marginTop: 8,
    lineHeight: 17,
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
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  aiFeedbackCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1D9E75',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  aiFeedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiFeedbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D9E75',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  aiFeedbackText: {
    fontSize: 14,
    color: '#2D3748',
    lineHeight: 21,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  aiCloseBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  aiCloseBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
});