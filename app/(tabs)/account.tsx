import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { getUserProfile, updateUserProfile, UserProfile } from '../../services/firestoreService';

export default function AccountScreen() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // Controls the lock/unlock state

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setEmail(user?.email ?? '');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!uid) {
        setLoading(false);
        return;
      }
      try {
        const profile = await getUserProfile(uid);
        if (profile) {
          setName(profile.name ?? '');
          setNickname(profile.nickname ?? profile.name ?? '');
          setEmail(profile.email ?? auth.currentUser?.email ?? '');
          setAge(profile.age ? String(profile.age) : '');
          setWeight(profile.weight ? String(profile.weight) : '');
          setGoal(profile.goal ?? '');
        } else {
          setEmail(auth.currentUser?.email ?? '');
        }
      } catch {
        Alert.alert('Error', 'Could not load your profile.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [uid]);

  const handleSave = async () => {
    if (!uid) {
      Alert.alert('Error', 'Please sign in again.');
      return;
    }
    if (!name || !nickname || !email || !age || !weight || !goal) {
      Alert.alert('Error', 'Please fill in all profile fields.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<UserProfile> = {
        name: name.trim(),
        nickname: nickname.trim(),
        email: email.trim(),
        age: parseInt(age, 10),
        weight: parseFloat(weight),
        goal: goal.trim(),
      };

      await updateUserProfile(uid, payload);
      Alert.alert('Saved', 'Your profile was updated.');
      setIsEditing(false); // Lock it back after saving
    } catch {
      Alert.alert('Error', 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch {
      Alert.alert('Error', 'Could not log out.');
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
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Account Settings</Text>
          <Text style={styles.headerSub}>Manage your profile and session</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(nickname || name || email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.title}>{nickname || name || 'Member'}</Text>
          <Text style={styles.subtitle}>{email}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="trophy-outline" size={14} color="#0F6E56" />
              <Text style={styles.metaChipText}>{goal || 'No goal yet'}</Text>
            </View>
          </View>
        </View>

        {/* Profile Settings Card */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.sectionTitle}>Profile details</Text>
            <TouchableOpacity
              style={[styles.editToggleBtn, isEditing && styles.editToggleActive]}
              onPress={() => setIsEditing(!isEditing)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isEditing ? 'lock-open-outline' : 'lock-closed-outline'}
                size={14}
                color={isEditing ? '#0F6E56' : '#718096'}
              />
              <Text style={[styles.editToggleText, isEditing && styles.editToggleTextActive]}>
                {isEditing ? 'Editing Unlocked' : 'Lock Profile'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Input with Icon Container 1 */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Nickname</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="person-circle-outline" size={16} color="#0F6E56" />
              </View>
              <TextInput
                style={[styles.inputField, !isEditing && styles.inputDisabled]}
                value={nickname}
                onChangeText={setNickname}
                placeholder="Your nickname"
                editable={isEditing}
                placeholderTextColor="#A0AEC0"
              />
            </View>
          </View>

          {/* Input with Icon Container 2 (Updated Full Name) */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Full name</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#F8FAFC' }]}>
                <Ionicons name="person-outline" size={16} color="#475569" />
              </View>
              <TextInput
                style={[styles.inputField, !isEditing && styles.inputDisabled]}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                editable={isEditing}
                placeholderTextColor="#A0AEC0"
              />
            </View>
          </View>

          {/* Input with Icon Container 3 */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="mail-outline" size={16} color="#DC2626" />
              </View>
              <TextInput
                style={[styles.inputField, styles.readOnly]}
                value={email}
                editable={false}
                placeholderTextColor="#A0AEC0"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Age</Text>
              <View style={styles.inputContainer}>
                <View style={[styles.iconBg, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="calendar-outline" size={16} color="#475569" />
                </View>
                <TextInput
                  style={[styles.inputField, !isEditing && styles.inputDisabled]}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                  editable={isEditing}
                  placeholder="Age"
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Weight (kg)</Text>
              <View style={styles.inputContainer}>
                <View style={[styles.iconBg, { backgroundColor: '#FFFBEB' }]}>
                  <Ionicons name="speedometer-outline" size={18} color="#DC2626" />
                </View>
                <TextInput
                  style={[styles.inputField, !isEditing && styles.inputDisabled]}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  editable={isEditing}
                  placeholder="Weight"
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>
          </View>

          {/* Input with Icon Container 4 */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Fitness goal</Text>
            <View style={styles.inputContainer}>
              <View style={[styles.iconBg, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="flag-outline" size={16} color="#6B21A8" />
              </View>
              <TextInput
                style={[styles.inputField, !isEditing && styles.inputDisabled]}
                value={goal}
                onChangeText={setGoal}
                placeholder="Your fitness goal"
                editable={isEditing}
                placeholderTextColor="#A0AEC0"
              />
            </View>
          </View>

          {isEditing && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.saveText}>Save profile</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Stats Summary */}
        
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' },
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
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#FECACA',
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
  scroll: { padding: 16, paddingBottom: 48 },
  heroCard: {
    alignItems: 'center',
    marginBottom: 16,
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E1F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F6E56',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  subtitle: {
    fontSize: 12,
    color: '#718096',
    marginTop: 3,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E1F5EE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  metaChipText: {
    color: '#0F6E56',
    fontWeight: '700',
    fontSize: 12,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  card: {
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
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
  },
  editToggleActive: {
    backgroundColor: '#E1F5EE',
    borderColor: '#1D9E75',
  },
  editToggleText: {
    fontSize: 10,
    color: '#718096',
    fontWeight: '600',
  },
  editToggleTextActive: {
    color: '#0F6E56',
  },
  inputSection: { marginBottom: 6 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 4,
    marginTop: 6,
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    backgroundColor: '#F7FAFC',
    paddingRight: 10,
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
    fontSize: 13,
    color: '#1A202C',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  inputDisabled: {
    backgroundColor: '#EDF2F7',
    color: '#A0AEC0',
    borderColor: '#E2E8F0',
  },
  readOnly: { backgroundColor: '#EDF2F7', color: '#718096', borderColor: '#E2E8F0' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  saveBtn: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    paddingVertical: 13,
    shadowColor: '#1D9E75',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
  btnDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  quickIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 11,
    color: '#718096',
    fontFamily: Platform.select({
      ios: 'Poppins',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  quickValue: {
    marginLeft: 'auto',
    fontSize: 14,
    color: '#1A202C',
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'Montserrat',
      android: 'sans-serif-medium',
      default: 'sans-serif',
    }),
  },
});