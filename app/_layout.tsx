// app/_layout.tsx
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function RootLayout() {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let isMounted = true;
    let timeout: NodeJS.Timeout;

    try {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (isMounted) {
          setUser(firebaseUser);
          setLoading(false);
        }
        if (timeout) clearTimeout(timeout);
      });

      // Failsafe: stop loading after 5 seconds even if auth doesn't respond
      timeout = setTimeout(() => {
        if (isMounted && loading) {
          setLoading(false);
        }
      }, 5000);

      return () => {
        isMounted = false;
        unsubscribe();
        if (timeout) clearTimeout(timeout);
      };
    } catch (err) {
      console.error('Auth error:', err);
      if (isMounted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[1] === '(tabs)';

    if (!user && !inAuthGroup) {
      // Not logged in → go to login
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup && !inTabsGroup) {
      // Logged in and on auth root/login/register → go to main tabs
      router.replace('/(auth)/(tabs)/chatbot');
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return <Slot />;
}