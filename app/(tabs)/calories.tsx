import { useState, useEffect, useCallback } from 'react';
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
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import {
  saveNutrition,
  getNutritionToday,
  getWorkoutsThisWeek,
  NutritionEntry,
} from '@/services/firestoreService';
import { chatWithAI, calculateCalories } from '@/services/openrouter';

const QUICK_FOODS = [
  { food: 'White rice (1 cup)', calories: 206, protein: 4, carbs: 45, fat: 0 },
  { food: 'Egg (1 pc)', calories: 78, protein: 6, carbs: 1, fat: 5 },
  { food: 'Chicken breast', calories: 165, protein: 31, carbs: 0, fat: 4 },
  { food: 'Banana', calories: 89, protein: 1, carbs: 23, fat: 0 },
  { food: 'Bread (1 slice)', calories: 79, protein: 3, carbs: 15, fat: 1 },
  { food: 'Milk (1 cup)', calories: 149, protein: 8, carbs: 12, fat: 8 },
];

export default function CaloriesScreen() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userWeight, setUserWeight] = useState<number>(70); // Default 70kg

  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [burnedCal, setBurnedCal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // AI Reaction State
  const [aiReaction, setAiReaction] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Manual entry form
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setBurnedCal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unsubNutrition = onSnapshot(
      collection(db, 'nutrition'),
      (snap) => {
        const nextEntries = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as NutritionEntry))
          .filter((entry) => entry.uid === uid)
          .filter((entry) => {
            const date =
              entry.date instanceof Date
                ? entry.date
                : (entry.date as any)?.toDate?.() ??
                  new Date(entry.date as any);
            return date >= today;
          })
          .sort((a, b) => {
            const aDate =
              a.date instanceof Date
                ? a.date.getTime()
                : new Date(a.date as any).getTime();
            const bDate =
              b.date instanceof Date
                ? b.date.getTime()
                : new Date(b.date as any).getTime();
            return bDate - aDate;
          });
        setEntries(nextEntries);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        Alert.alert('Error', 'Could not load nutrition data.');
        setLoading(false);
        setRefreshing(false);
      }
    );

    // Calculate burned calories from activity goals
    const unsubGoals = onSnapshot(
      collection(db, 'goals'),
      async (snap) => {
        let totalBurned = 0;
        
        for (const goalDoc of snap.docs) {
          const goal = goalDoc.data() as any;
          
          // Skip calorie goals, only process activity goals (km, minutes, kg, workouts)
          const goalType = goal.type ?? goal.unit ?? '';
          if (goal.uid !== uid || goalType === 'calories') continue;
          
          try {
            // Get logs for this goal from today
            const logsSnap = await getDocs(collection(db, 'goals', goalDoc.id, 'logs'));
            const todayLogs = logsSnap.docs
              .map((d) => d.data() as any)
              .filter((log) => {
                const logDate = log.date instanceof Date 
                  ? log.date 
                  : log.date?.toDate?.() ?? new Date(log.date);
                return logDate >= today;
              });
            
            // Calculate calories burned for each log
            todayLogs.forEach((log) => {
              const value = log.value || 0;
              let burned = 0;
              
              if (goalType === 'km' || goalType === 'minutes') {
                // For km: assume running/walking, use MET 7.0 for jogging
                // For minutes: use MET 6.0 for general exercise
                const met = goalType === 'km' ? 7.0 : 6.0;
                const duration = goalType === 'km' ? (value * 1.6) / 15 : value; // Convert km to approx 15min per 1.6km
                burned = Math.round(met * userWeight * (duration / 60));
              } else if (goalType === 'kg') {
                // Weight loss goal - assume cardio activity, ~5 cal per kg change
                burned = Math.round(value * 5);
              } else if (goalType === 'workouts') {
                // Workouts assume 300 cal per workout session
                burned = Math.round(value * 300);
              }
              
              totalBurned += burned;
            });
          } catch (err) {
            console.error('Error calculating burned calories for goal:', goalDoc.id, err);
          }
        }
        
        setBurnedCal(totalBurned);
      },
      () => {
        console.error('Error loading goals for calorie calculation');
      }
    );

    return () => {
      unsubNutrition();
      unsubGoals();
    };
  }, [uid, userWeight]);

  const loadData = useCallback(async () => {
    try {
      if (!uid) {
        setEntries([]);
        setBurnedCal(0);
        return;
      }
      const nutritionData = await getNutritionToday(uid);
      setEntries(nutritionData);

      // Calculate burned calories from activity goals
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const goalsSnap = await getDocs(query(collection(db, 'goals')));
      let totalBurned = 0;
      
      for (const goalDoc of goalsSnap.docs) {
        const goal = goalDoc.data() as any;
        const goalType = goal.type ?? goal.unit ?? '';
        
        if (goal.uid !== uid || goalType === 'calories') continue;
        
        try {
          const logsSnap = await getDocs(collection(db, 'goals', goalDoc.id, 'logs'));
          const todayLogs = logsSnap.docs
            .map((d) => d.data() as any)
            .filter((log) => {
              const logDate = log.date instanceof Date 
                ? log.date 
                : log.date?.toDate?.() ?? new Date(log.date);
              return logDate >= today;
            });
          
          todayLogs.forEach((log) => {
            const value = log.value || 0;
            let burned = 0;
            
            if (goalType === 'km' || goalType === 'minutes') {
              const met = goalType === 'km' ? 7.0 : 6.0;
              const duration = goalType === 'km' ? (value * 1.6) / 15 : value;
              burned = Math.round(met * userWeight * (duration / 60));
            } else if (goalType === 'kg') {
              burned = Math.round(value * 5);
            } else if (goalType === 'workouts') {
              burned = Math.round(value * 300);
            }
            
            totalBurned += burned;
          });
        } catch (err) {
          console.error('Error calculating burned calories:', err);
        }
      }
      
      setBurnedCal(totalBurned);
    } catch {
      Alert.alert('Error', 'Could not load nutrition data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, userWeight]);

  useEffect(() => {
    if (uid !== null) {
      loadData();
    }
  }, [uid, loadData]);

  const totalCaloriesIn = entries.reduce((s, e) => s + e.calories, 0);
  const totalProtein = entries.reduce((s, e) => s + e.protein, 0);
  const totalCarbs = entries.reduce((s, e) => s + e.carbs, 0);
  const totalFat = entries.reduce((s, e) => s + e.fat, 0);
  const netCalories = totalCaloriesIn - burnedCal;

  const triggerAiReaction = async (foodName: string, cal: number) => {
    setAiLoading(true);
    try {
      const prompt = `You are FitAI, a friendly fitness coach. The user just logged a food item: ${foodName} containing ${cal} kcal. Give them a quick, warm, and motivating 1-2 sentence reaction (you can mix a little Bisaya or Tagalog if appropriate) to encourage their meal choice or cheer them on!`;
      
      const reaction = await chatWithAI([{ role: 'user', content: prompt }], 'You are a motivating assistant.');
      setAiReaction(reaction);
    } catch (e) {
      console.error('AI reaction error:', e);
    } finally {
      setAiLoading(false);
    }
  };

  // AI Auto-Detection Function
  const handleAutoDetect = async () => {
    if (!food.trim()) {
      Alert.alert('Error', 'Please enter a food name to detect nutrition values.');
      return;
    }
    setAutoDetecting(true);
    try {
      const prompt = `You are an AI nutritionist. Analyze the food item "${food.trim()}". Return the response strictly in this exact format, without markdown or extra text:
Calories: [number]
Protein: [number]
Carbs: [number]
Fat: [number]`;

      const response = await chatWithAI([{ role: 'user', content: prompt }], 'You are a precise nutrition detector.');
      
      const lines = response.split('\n');
      let calFound = '';
      let proFound = '';
      let carbFound = '';
      let fatFound = '';

      lines.forEach((line) => {
        if (line.toLowerCase().includes('calories:')) {
          calFound = line.replace(/[^0-9.]/g, '');
        } else if (line.toLowerCase().includes('protein:')) {
          proFound = line.replace(/[^0-9.]/g, '');
        } else if (line.toLowerCase().includes('carbs:')) {
          carbFound = line.replace(/[^0-9.]/g, '');
        } else if (line.toLowerCase().includes('fat:')) {
          fatFound = line.replace(/[^0-9.]/g, '');
        }
      });

      if (calFound) setCalories(calFound);
      if (proFound) setProtein(proFound);
      if (carbFound) setCarbs(carbFound);
      if (fatFound) setFat(fatFound);

    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to auto-detect nutrition. Please fill in manually.');
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      Alert.alert('Error', 'Please sign in again.');
      return;
    }
    if (!food || !calories) {
      Alert.alert('Error', 'Food name and calories are required.');
      return;
    }
    setSaving(true);
    try {
      const parsedCalories = parseInt(calories) || 0;
      await saveNutrition({
        uid,
        food: food.trim(),
        calories: parsedCalories,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        date: new Date(),
      });

      // Reset Form
      setFood('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setShowModal(false);

      await loadData();
      await triggerAiReaction(food, parsedCalories);
    } catch {
      Alert.alert('Error', 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async (item: typeof QUICK_FOODS[0]) => {
    if (!uid) return;
    try {
      await saveNutrition({ uid, ...item, date: new Date() });
      await loadData();
      await triggerAiReaction(item.food, item.calories);
    } catch {
      Alert.alert('Error', 'Could not add food.');
    }
  };

  const formatDate = (dateValue: any) => {
    const dateObj =
      dateValue instanceof Date
        ? dateValue
        : dateValue?.toDate
        ? dateValue.toDate()
        : new Date(dateValue);
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const MacroBar = ({
    label,
    value,
    total,
    color,
  }: {
    label: string;
    value: number;
    total: number;
    color: string;
  }) => {
    const pct = total > 0 ? Math.min(value / total, 1) : 0;
    return (
      <View style={styles.macroItem}>
        <View style={styles.macroLabelRow}>
          <Text style={styles.macroLabel}>{label}</Text>
          <Text style={styles.macroVal}>{Math.round(value)}g</Text>
        </View>
        <View style={styles.macroBg}>
          <View
            style={[
              styles.macroFill,
              {
                width: `${Math.round(pct * 100)}%` as any,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </View>
    );
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Calorie Tracker</Text>
          <Text style={styles.headerSub}>Today's nutrition</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Log food</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor="#1D9E75"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* AI Reaction Banner */}
        {(aiReaction || aiLoading) && (
          <View style={styles.aiBanner}>
            <View style={styles.aiIconWrapper}>
              <Ionicons name="sparkles" size={18} color="#0F6E56" />
            </View>
            <View style={styles.aiContent}>
              {aiLoading ? (
                <ActivityIndicator size="small" color="#1D9E75" />
              ) : (
                <Text style={styles.aiText}>{aiReaction}</Text>
              )}
            </View>
          </View>
        )}

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="restaurant-outline" size={18} color="#0F6E56" />
            </View>
            <Text style={styles.summaryLabel}>Calories in</Text>
            <Text style={[styles.summaryVal, { color: '#1A202C' }]}>
              {totalCaloriesIn}
            </Text>
            <Text style={styles.summaryUnit}>kcal</Text>
          </View>

          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.iconBg, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="flame-outline" size={18} color="#DC2626" />
            </View>
            <Text style={styles.summaryLabel}>Burned</Text>
            <Text style={[styles.summaryVal, { color: '#DC2626' }]}>
              {burnedCal}
            </Text>
            <Text style={styles.summaryUnit}>kcal</Text>
          </View>

          <View style={[styles.summaryCard, { flex: 1 }]}>
            <View style={[styles.iconBg, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="calculator-outline" size={18} color="#475569" />
            </View>
            <Text style={styles.summaryLabel}>Net</Text>
            <Text
              style={[
                styles.summaryVal,
                { color: netCalories > 2000 ? '#EF4444' : '#1A202C' },
              ]}
            >
              {netCalories}
            </Text>
            <Text style={styles.summaryUnit}>kcal</Text>
          </View>
        </View>

        {/* Macros */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Macros today</Text>
            <Ionicons name="pie-chart-outline" size={18} color="#1D9E75" />
          </View>
          <MacroBar
            label="Protein"
            value={totalProtein}
            total={totalProtein + totalCarbs + totalFat}
            color="#1D9E75"
          />
          <MacroBar
            label="Carbs"
            value={totalCarbs}
            total={totalProtein + totalCarbs + totalFat}
            color="#F59E0B"
          />
          <MacroBar
            label="Fat"
            value={totalFat}
            total={totalProtein + totalCarbs + totalFat}
            color="#EF4444"
          />
        </View>

        {/* Quick add */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick add</Text>
          <Ionicons name="flash-outline" size={16} color="#718096" />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickScroll}
        >
          {QUICK_FOODS.map((item) => (
            <TouchableOpacity
              key={item.food}
              style={styles.quickCard}
              onPress={() => handleQuickAdd(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.quickFood}>{item.food}</Text>
              <Text style={styles.quickCal}>{item.calories} kcal</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Today's log */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's log</Text>
          <Ionicons name="list-outline" size={16} color="#718096" />
        </View>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="nutrition-outline" size={36} color="#A0AEC0" />
            <Text style={styles.emptySub}>No food logged yet today</Text>
          </View>
        ) : (
          entries.map((entry, i) => (
            <View key={entry.id ?? i} style={styles.entryRow}>
              <View style={styles.entryDetails}>
                <Text style={styles.entryFood}>{entry.food}</Text>
                <Text style={styles.entryDate}>
                  <Ionicons name="time-outline" size={11} />{' '}
                  {formatDate(entry.date)}
                </Text>
                <Text style={styles.entryMacros}>
                  P: {Math.round(entry.protein)}g · C:{' '}
                  {Math.round(entry.carbs)}g · F: {Math.round(entry.fat)}g
                </Text>
              </View>
              <Text style={styles.entryCal}>{entry.calories} kcal</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Log Food Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Log food</Text>

            <Text style={styles.label}>Food name</Text>
            <View style={styles.foodInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="e.g. Adobo chicken"
                placeholderTextColor="#A0AEC0"
                value={food}
                onChangeText={setFood}
              />
              <TouchableOpacity
                style={styles.aiDetectBtn}
                onPress={handleAutoDetect}
                disabled={autoDetecting}
                activeOpacity={0.8}
              >
                {autoDetecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={14} color="#fff" />
                    <Text style={styles.aiDetectText}>Auto Detect</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Calories (kcal)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 320"
              placeholderTextColor="#A0AEC0"
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
            />

            <View style={styles.macroInputRow}>
              <View style={styles.macroInput}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#A0AEC0"
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.macroInput}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#A0AEC0"
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.macroInput}>
                <Text style={styles.label}>Fat (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#A0AEC0"
                  value={fat}
                  onChangeText={setFat}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveModalBtn,
                  saving && styles.saveModalBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveModalText}>Save</Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 2,
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
  addBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: { padding: 16, paddingBottom: 48 },
  aiBanner: {
    backgroundColor: '#E6FFFA',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: '#B2F5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  aiIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#C6F6D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiContent: {
    flex: 1,
  },
  aiText: {
    fontSize: 13,
    color: '#1D4044',
    fontStyle: 'italic',
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#718096',
    marginBottom: 4,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  summaryVal: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  summaryUnit: {
    fontSize: 10,
    color: '#A0AEC0',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  macroItem: { marginBottom: 10 },
  macroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 12,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  macroVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A202C',
  },
  macroBg: {
    height: 5,
    backgroundColor: '#EDF2F7',
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: { height: 5, borderRadius: 3 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  quickScroll: { marginBottom: 16 },
  quickCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    minWidth: 125,
  },
  quickFood: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '500',
    marginBottom: 4,
  },
  quickCal: {
    fontSize: 12,
    color: '#1D9E75',
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  emptySub: {
    fontSize: 13,
    color: '#A0AEC0',
    marginTop: 8,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  entryRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  entryDetails: { flex: 1, gap: 2 },
  entryFood: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A202C',
  },
  entryDate: {
    fontSize: 10,
    color: '#A0AEC0',
  },
  entryMacros: {
    fontSize: 11,
    color: '#718096',
    marginTop: 2,
  },
  entryCal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D9E75',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A202C',
    marginBottom: 12,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 5,
    marginTop: 8,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  foodInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  aiDetectBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiDetectText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  input: {
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: '#1A202C',
    backgroundColor: '#F7FAFC',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  macroInputRow: { flexDirection: 'row', gap: 10 },
  macroInput: { flex: 1 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '600',
  },
  saveModalBtn: {
    flex: 1,
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveModalBtnDisabled: { opacity: 0.6 },
  saveModalText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
});