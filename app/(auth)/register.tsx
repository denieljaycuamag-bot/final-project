import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebase';

const FITNESS_GOALS = ['Lose weight', 'Build muscle', 'Improve stamina', 'Stay active'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [age, setAge]           = useState('');
  const [weight, setWeight]     = useState('');
  const [goal, setGoal]         = useState('');
  const [loading, setLoading]   = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(100)).current; // Starts off-screen

  // Animation values
  const [fadeAnim] = useState(new Animated.Value(0));
  const [translateYAnim] = useState(new Animated.Value(20));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateYAnim]);

  // Toast Function
  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);

    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 0, // Slide up to original position
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000), // Wait 3 seconds
      Animated.timing(toastAnim, {
        toValue: 100, // Slide down
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !confirm || !age || !weight || !goal) {
      showToast('All fields are required.');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);

      await setDoc(doc(db, 'users', user.uid), {
        name:      name.trim(),
        nickname:  name.trim(),
        email:     email.trim(),
        age:       parseInt(age),
        weight:    parseFloat(weight),
        goal,
        createdAt: new Date(),
      });
      // _layout.tsx onAuthStateChanged will redirect to (tabs) automatically
    } catch (error: any) {
      let msg = 'Something went wrong.';
      if (error.code === 'auth/email-already-in-use') msg = 'Email is already registered.';
      if (error.code === 'auth/invalid-email')        msg = 'Invalid email address.';
      if (error.code === 'auth/weak-password')        msg = 'Password is too weak.';
      
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.inner} 
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: translateYAnim }],
            width: '100%',
          }}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>FitAI</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          <View style={styles.form}>
            {/* ── Account info ── */}
            <Text style={styles.sectionTitle}>Account info</Text>

            <Text style={styles.label}>Full name</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="person-outline" size={16} color="#0F6E56" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="Juan dela Cruz"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
              />
            </View>

            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="mail-outline" size={16} color="#0F6E56" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="you@email.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="Min. 6 characters"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="lock-closed-outline" size={16} color="#DC2626" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {/* ── Profile info ── */}
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Your profile</Text>
            <Text style={styles.sectionHint}>Used to calculate your calories burned accurately</Text>

            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.label}>Age</Text>
                <View style={styles.inputContainer}>
                  <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="calendar-outline" size={16} color="#0F6E56" />
                  </View>
                  <TextInput
                    style={[styles.inputField, { paddingHorizontal: 6 }]}
                    placeholder="22"
                    placeholderTextColor="#9CA3AF"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.label}>Weight (kg)</Text>
                <View style={styles.inputContainer}>
                  <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="barbell-outline" size={16} color="#0F6E56" />
                  </View>
                  <TextInput
                    style={[styles.inputField, { paddingHorizontal: 6 }]}
                    placeholder="65"
                    placeholderTextColor="#9CA3AF"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>

            <Text style={styles.label}>Fitness goal</Text>
            <View style={styles.goalGrid}>
              {FITNESS_GOALS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, goal === g && styles.chipActive]}
                  onPress={() => setGoal(g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, goal === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Create account</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>Log in</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Toast Notification Container */}
      {toastVisible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastAnim }],
            },
          ]}
        >
          <View style={styles.toastContent}>
            <Ionicons name="alert-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F9FAFB' },
  inner:          { paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  header:         { alignItems: 'center', marginBottom: 32 },
  logo:           { fontSize: 40, fontWeight: '700', color: '#1D9E75', letterSpacing: -1 },
  subtitle:       { fontSize: 15, color: '#6B7280', marginTop: 6 },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle:   { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  sectionHint:    { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  divider:        { borderTopWidth: 1, borderColor: '#F3F4F6', marginVertical: 20 },
  label:          { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingRight: 10,
  },
  iconBgContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  row:            { flexDirection: 'row', gap: 12 },
  halfCol:        { flex: 1 },
  goalGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  chipActive:     { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  chipText:       { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  btn:            { backgroundColor: '#1D9E75', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnDisabled:    { opacity: 0.6 },
  btnText:        { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer:         { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText:     { color: '#6B7280', fontSize: 14 },
  link:           { color: '#1D9E75', fontSize: 14, fontWeight: '600' },
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: 28,
    right: 28,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});