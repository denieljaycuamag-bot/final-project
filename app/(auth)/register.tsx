// app/(auth)/register.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';

const FITNESS_GOALS = ['Lose weight', 'Build muscle', 'Improve stamina', 'Stay active'];

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
  const [error, setError]       = useState('');

  const handleRegister = async () => {
    setError('');

    if (!name || !email || !password || !confirm || !age || !weight || !goal) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
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
    } catch (err: any) {
      let msg = 'Something went wrong. Please try again.';
      if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
      if (err.code === 'auth/invalid-email')        msg = 'Invalid email address.';
      if (err.code === 'auth/weak-password')        msg = 'Password is too weak.';
      setError(msg);
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>FitAI</Text>
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        <View style={styles.form}>

          {/* Error box */}
          {error !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Account info ── */}
          <Text style={styles.sectionTitle}>Account info</Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Juan dela Cruz"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@email.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Min. 6 characters"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setError(''); }}
            secureTextEntry
            autoCapitalize="none"
          />

          {/* ── Profile info ── */}
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Your profile</Text>
          <Text style={styles.sectionHint}>Used to calculate your calories burned accurately</Text>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="22"
                placeholderTextColor="#9CA3AF"
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                placeholder="65"
                placeholderTextColor="#9CA3AF"
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
              />
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

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.link}>Log in</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F9FAFB' },
  inner:          { paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 },
  header:         { alignItems: 'center', marginBottom: 32 },
  logo:           { fontSize: 40, fontWeight: '700', color: '#1D9E75', letterSpacing: -1 },
  subtitle:       { fontSize: 15, color: '#6B7280', marginTop: 6 },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText:      { color: '#DC2626', fontSize: 13, fontWeight: '500' },
  sectionTitle:   { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  sectionHint:    { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  divider:        { borderTopWidth: 1, borderColor: '#F3F4F6', marginVertical: 20 },
  label:          { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
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
  footer:         { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:     { color: '#6B7280', fontSize: 14 },
  link:           { color: '#1D9E75', fontSize: 14, fontWeight: '600' },
});