import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase';
import {
  extractWorkoutFromText,
  chatWithAI,
  calculateCalories,
} from '@/services/openrouter';
import {
  saveWorkout,
  getWorkoutsThisWeek,
  getUserProfile,
  getNutritionToday,
  getGoals,
  getGoalLogs,
  saveChatMessage,
  getChatMessages,
} from '@/services/firestoreService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt?: any;
}

const SYSTEM_PROMPT = `You are FitAI, a friendly and intelligent fitness coach chatbot. You help users track workouts, give fitness tips, and motivate them.

You are multilingual. You can converse naturally in English, Tagalog, and Cebuano/Bisaya. Mix and match these languages to make the conversation warm and conversational when appropriate.

Use any app context provided in the prompt to answer questions about calories, macronutrients (proteins, carbs, fats), water intake, workouts, and goals.

CRITICAL INSTRUCTIONS FOR DIALOGUE:
1. If the user asks "pila akoa calories now?" (or any variation regarding today's calories/macros in Bisaya/Tagalog/English), DO NOT output the goal error message.
2. Calculate and reply using the exact values of today's calories, burned calories, net calories, and macros found in the context provided below.
3. If the user tells you about a workout they did:
   - Confirm what they logged.
   - Tell them the calories burned (you will receive this in the user message context).
   - Give a short, encouraging, and actionable fitness or health tip.

Keep replies short, friendly, and motivating. Use simple language.

If the user asks who made, created, or programmed you, say that you were developed by Deniel Cuamag as a final project.`;

const WORKOUT_KEYWORDS = [
  'ran', 'run', 'jog', 'jogged', 'walked', 'walk', 'swam', 'swim', 'bike', 'biked',
  'cycled', 'cycle', 'push', 'squat', 'plank', 'workout', 'exercise', 'gym',
  'hiit', 'yoga', 'cardio', 'km', 'miles', 'minutes', 'sets', 'reps',
];

const isWorkoutMessage = (text: string): boolean => {
  const lower = text.toLowerCase();
  return WORKOUT_KEYWORDS.some((kw) => lower.includes(kw));
};

const DEFAULT_GREETING = "Hey there! I'm FitAI 🏋️. Tell me about your workout today, or ask me anything fitness-related! (Pwede pud ta mag-Bisaya diri, 'bay!)";

type LoadedContext = {
  displayName: string;
  weight: number;
  caloriesIn: number;
  caloriesBurned: number;
  netCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  activeGoalsCount: number;
  latestWorkoutSummary: string;
  goalSummaries: string[];
};

const formatDate = (value: any) => {
  if (!value) return 'unknown';
  const date = value instanceof Date ? value : value?.toDate?.() ?? new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatNumber = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
};

const getGoalTypeValue = (goal: any) => (goal.type ?? goal.unit ?? 'workouts').toLowerCase();

const stripMarkdown = (text: string): string => {
  // Remove bold (**text** -> text)
  return text.replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove italic (*text* -> text)
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove code (`text` -> text)
    .replace(/`([^`]+)`/g, '$1');
};

const buildGoalSummary = (goal: any, logs: any[]) => {
  const completed = logs.reduce((sum, log) => sum + (Number(log.value) || 0), 0);
  const remaining = Math.max((goal.target ?? 0) - completed, 0);
  const progress = goal.target > 0 ? Math.min(completed / goal.target, 1) : 0;
  const typeValue = getGoalTypeValue(goal);
  const status = progress >= 1 ? 'Completed' : progress >= 0.5 ? 'On track' : 'Behind';

  return `${goal.title} | due ${formatDate(goal.deadline)} | ${status} | ${Math.round(progress * 100)}% | ${formatNumber(completed)} / ${goal.target} ${typeValue}${remaining > 0 ? ` | need ${formatNumber(remaining)} more ${typeValue}` : ''}`;
};

const createGreeting = (displayName: string) => (
  displayName
    ? `Hey ${displayName}! I'm FitAI 🏋️. Tell me about your workout today, or ask me anything fitness-related! (Pwede pud ta mag-Bisaya diri, 'bay!)`
    : DEFAULT_GREETING
);

const buildAppSnapshot = (params: {
  displayName: string;
  weight: number;
  caloriesIn: number;
  caloriesBurned: number;
  netCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  activeGoalsCount: number;
  latestWorkoutSummary: string;
  goalSummaries: string[];
}) => {
  const lines = [
    `User name: ${params.displayName || 'unknown'}`,
    `Weight: ${params.weight || 'unknown'} kg`,
    `Today's calories in: ${params.caloriesIn} kcal`,
    `Today's calories burned: ${params.caloriesBurned} kcal`,
    `Today's net calories: ${params.netCalories} kcal`,
    `Today's Macros: Protein ${params.protein}g | Carbs ${params.carbs}g | Fat ${params.fat}g`,
    `Active goals: ${params.activeGoalsCount}`,
  ];

  if (params.activeGoalsCount === 0) {
    lines.push('Tracker goal state: no active goals');
  }

  if (params.goalSummaries.length > 0) {
    lines.push('Goals:');
    params.goalSummaries.forEach((summary) => lines.push(`  - ${summary}`));
  } else {
    lines.push('Goals: none');
  }

  if (params.latestWorkoutSummary) {
    lines.push(`Latest workout: ${params.latestWorkoutSummary}`);
  }

  return `\n\n[APP CONTEXT - use this to personalize and answer questions]\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
};

export default function ChatbotScreen() {
  const uid = auth.currentUser?.uid ?? '';

  const [displayName, setDisplayName] = useState('');
  const [goalSummaries, setGoalSummaries] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      text: DEFAULT_GREETING,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userWeight, setUserWeight] = useState(70);
  const [caloriesInToday, setCaloriesInToday] = useState(0);
  const [caloriesBurnedToday, setCaloriesBurnedToday] = useState(0);
  const [proteinToday, setProteinToday] = useState(0);
  const [carbsToday, setCarbsToday] = useState(0);
  const [fatToday, setFatToday] = useState(0);
  const [waterToday, setWaterToday] = useState(0);
  const [activeGoalsCount, setActiveGoalsCount] = useState(0);
  const [latestWorkoutSummary, setLatestWorkoutSummary] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const listRef = useRef<FlatList>(null);

  async function loadContext(): Promise<LoadedContext | null> {
    if (!uid) return null;

    try {
      const [profile, historyMessages, nutritionToday, workoutsThisWeek, goals] = await Promise.all([
        getUserProfile(uid),
        getChatMessages(uid),
        getNutritionToday(uid),
        getWorkoutsThisWeek(uid),
        getGoals(uid),
      ]);

      const logsByGoal = await Promise.all(
        goals.map(async (goalItem) => ({
          goalItem,
          logs: goalItem.id ? await getGoalLogs(goalItem.id) : [],
        }))
      );

      const name = profile?.nickname?.trim() || profile?.name?.trim() || '';
      setDisplayName(name);
      if (profile?.weight) setUserWeight(profile.weight);

      const caloriesIn = nutritionToday.reduce((sum, entry) => sum + (entry.calories ?? 0), 0);
      const protein = nutritionToday.reduce((sum, entry) => sum + (entry.protein ?? 0), 0);
      const carbs = nutritionToday.reduce((sum, entry) => sum + (entry.carbs ?? 0), 0);
      const fat = nutritionToday.reduce((sum, entry) => sum + (entry.fat ?? 0), 0);
      
      const caloriesBurned = workoutsThisWeek.reduce((sum, workout) => sum + (workout.calories ?? 0), 0);
      const latestWorkout = workoutsThisWeek[0];
      const latestWorkoutText = latestWorkout
        ? `${latestWorkout.exercise} for ${latestWorkout.duration_min ?? 'n/a'} min, ${latestWorkout.calories ?? 0} kcal`
        : '';
      const summaries = logsByGoal.map(({ goalItem, logs }) => buildGoalSummary(goalItem, logs));

      setCaloriesInToday(caloriesIn);
      setCaloriesBurnedToday(caloriesBurned);
      setProteinToday(protein);
      setCarbsToday(carbs);
      setFatToday(fat);
      setActiveGoalsCount(goals.length);
      setLatestWorkoutSummary(latestWorkoutText);
      setGoalSummaries(summaries);

      const greeting = createGreeting(name);
      const dedupedHistory = Array.from(
        new Map((historyMessages ?? []).map((message) => [message.id, message])).values()
      );

      setMessages([
        { id: '0', role: 'assistant', text: greeting },
        ...dedupedHistory,
      ]);

      return {
        displayName: name,
        weight: profile?.weight ?? userWeight,
        caloriesIn,
        caloriesBurned,
        netCalories: caloriesIn - caloriesBurned,
        protein,
        carbs,
        fat,
        activeGoalsCount: goals.length,
        latestWorkoutSummary: latestWorkoutText,
        goalSummaries: summaries,
      };
    } catch (err) {
      console.error('Failed to load chatbot context', err);
      return null;
    }
  }

  useFocusEffect(
    () => {
      loadContext();
      return undefined;
    }
  );

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !uid) return;

    const context = await loadContext();
    if (!context) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      await saveChatMessage(uid, {
        id: userMsg.id,
        role: userMsg.role,
        text: userMsg.text,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('Error saving user message', e);
    }

    try {
      let contextText = text;
      const appSnapshot = buildAppSnapshot({
        displayName: context.displayName,
        weight: context.weight,
        caloriesIn: context.caloriesIn,
        caloriesBurned: context.caloriesBurned,
        netCalories: context.netCalories,
        protein: context.protein,
        carbs: context.carbs,
        fat: context.fat,
        activeGoalsCount: context.activeGoalsCount,
        latestWorkoutSummary: context.latestWorkoutSummary,
        goalSummaries: context.goalSummaries,
      });

      if (isWorkoutMessage(text)) {
        const extracted = await extractWorkoutFromText(text);

        if (extracted) {
          const calories = calculateCalories(
            extracted.exercise,
            extracted.duration_min,
            userWeight,
            extracted.reps,
            extracted.sets
          );

          await saveWorkout({
            uid,
            exercise:    extracted.exercise,
            distance_km:  extracted.distance_km,
            duration_min: extracted.duration_min,
            reps:         extracted.reps,
            sets:         extracted.sets,
            calories,
            date:         new Date(),
          });

          contextText = `${text}

[SYSTEM CONTEXT - do not repeat this to user]:
Workout logged successfully:
- Exercise: ${extracted.exercise}
- Distance: ${extracted.distance_km ? extracted.distance_km + ' km' : 'N/A'}
- Duration: ${extracted.duration_min ? extracted.duration_min + ' min' : 'N/A'}
- Reps/Sets: ${extracted.reps ? extracted.reps + ' reps' : 'N/A'} ${extracted.sets ? '× ' + extracted.sets + ' sets' : ''}
- Calories burned: ${calories} kcal

Confirm the log and mention the ${calories} calories burned. Be encouraging. You can reply in English, Tagalog, or Bisaya.`;

          try {
            await getWorkoutsThisWeek(uid);
          } catch (_) {}
        }
      }

      // Bypass goal restrictions if querying for daily calorie/nutrition values
      const isCalorieQuery = /\b(calories|cal|pila|macros|protein|carbs|fat|water)\b/i.test(text);

      if (context.activeGoalsCount === 0 && /\b(goal|goals|tracker|kanus-a|when)\b/i.test(text) && !isCalorieQuery) {
        const noGoalReply = context.displayName
          ? `You currently have no active goals in the tracker, ${context.displayName}. Add one in Goals first and I can help you track it.`
          : 'You currently have no active goals in the tracker. Add one in Goals first and I can help you track it.';

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: noGoalReply,
        };

        setMessages((prev) => [...prev, aiMsg]);

        await saveChatMessage(uid, {
          id: aiMsg.id,
          role: aiMsg.role,
          text: aiMsg.text,
          createdAt: new Date(),
        });

        return;
      }

      const history = context.activeGoalsCount === 0 && !isCalorieQuery
        ? []
        : messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.text }));

      const aiText = await chatWithAI(
        [...history, { role: 'user', content: `${contextText}${appSnapshot}` }],
        SYSTEM_PROMPT + appSnapshot
      );

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: aiText,
      };

      setMessages((prev) => [...prev, aiMsg]);

      await saveChatMessage(uid, {
        id: aiMsg.id,
        role: aiMsg.role,
        text: aiMsg.text,
        createdAt: new Date(),
      });

    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'assistant', text: "Pasayloa ko, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollBtn(false);
  };

  const handleScroll = (event: any) => {
    const yOffset = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const viewHeight = event.nativeEvent.layoutMeasurement.height;

    if (contentHeight > viewHeight && yOffset < contentHeight - viewHeight - 100) {
      setShowScrollBtn(true);
    } else {
      setShowScrollBtn(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const cleanText = isUser ? item.text : stripMarkdown(item.text);
    return (
      <View style={[styles.row, isUser && styles.rowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="fitness" size={16} color="#FFFFFF" />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
            {cleanText}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FitAI Chat</Text>
        <Text style={styles.headerSub}>Your personal AI fitness coach</Text>
      </View>

      <View style={{ flex: 1, position: 'relative' }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        {showScrollBtn && (
          <TouchableOpacity
            style={styles.scrollBtn}
            onPress={scrollToBottom}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.macroCard}>
        <Text style={styles.macroTitle}>Today's Snapshot</Text>
        <View style={styles.macroGrid}>
          <View style={styles.macroItem}>
            <Text style={styles.macroVal}>{caloriesInToday - caloriesBurnedToday} kcal</Text>
            <Text style={styles.macroLabel}>Net Cal</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroVal}>{proteinToday}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroVal}>{carbsToday}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroVal}>{fatToday}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroVal}>{waterToday}ml</Text>
            <Text style={styles.macroLabel}>Water</Text>
          </View>
        </View>
      </View>

      {loading && (
        <View style={styles.typingRow}>
          <View style={styles.avatar}>
            <Ionicons name="fitness" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.typingBubble}>
            <ActivityIndicator size="small" color="#1D9E75" />
          </View>
        </View>
      )}

      <View style={styles.quickRow}>
        {['I ran 5km in 30min', '50 push-ups', 'Pila ka calories ma burn?'].map((q) => (
          <TouchableOpacity
            key={q}
            style={styles.quickBtn}
            onPress={() => setInput(q)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Tell me about your workout or ask a question..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={300}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
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
  list: { padding: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  rowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 1,
    elevation: 1,
  },
  bubbleAI: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  bubbleUser: {
    backgroundColor: '#1D9E75',
    marginRight: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  bubbleTextAI: {
    color: '#2D3748',
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  typingBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  scrollBtn: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: '#1D9E75',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3.84,
    elevation: 4,
    zIndex: 10,
  },
  macroCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  macroTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A5568',
    marginBottom: 4,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D9E75',
  },
  macroLabel: {
    fontSize: 9,
    color: '#A0AEC0',
  },
  quickRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  quickBtn: {
    backgroundColor: '#E6FFFA',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: '#B2F5EA',
  },
  quickText: {
    fontSize: 12,
    color: '#234E52',
    fontWeight: '500',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
    backgroundColor: '#F7FAFC',
    maxHeight: 100,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#CBD5E0',
    shadowOpacity: 0,
  },
});