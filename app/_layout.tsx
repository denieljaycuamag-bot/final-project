// app/_layout.tsx
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function RootLayout() {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let isMounted = true;
    let timeout: NodeJS.Timeout;
    let authTimeout: NodeJS.Timeout;

    try {
      const unsubscribe = onAuthStateChanged(
        auth,
        (firebaseUser) => {
          if (isMounted) {
            setUser(firebaseUser);
            setLoading(false);
            if (timeout) clearTimeout(timeout);
            if (authTimeout) clearTimeout(authTimeout);
          }
        },
        (error) => {
          console.error('Auth state error:', error);
          if (isMounted) {
            setAuthError(true);
            setLoading(false);
          }
        }
      );

      // Aggressive timeout: force stop loading after 2 seconds
      timeout = setTimeout(() => {
        if (isMounted) {
          console.warn('Auth check timeout - forcing continue');
          setLoading(false);
        }
      }, 2000);

      // Backup timeout in case unsubscribe or listener fails
      authTimeout = setTimeout(() => {
        if (isMounted && loading) {
          console.error('Auth listener unresponsive - forcing state');
          setLoading(false);
        }
      }, 3000);

      return () => {
        isMounted = false;
        unsubscribe();
        if (timeout) clearTimeout(timeout);
        if (authTimeout) clearTimeout(authTimeout);
      };
    } catch (err) {
      console.error('Auth setup error:', err);
      if (isMounted) {
        setAuthError(true);
        setLoading(false);
      }
    }
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[1] === '(tabs)';

    // If auth error or no user, go to login
    if (authError || (!user && !inAuthGroup)) {
      router.replace('/(auth)/login');
    } 
    // If user exists and not in tabs, go to main
    else if (user && inAuthGroup && !inTabsGroup) {
      router.replace('/(auth)/(tabs)/chatbot');
    }
  }, [user, loading, segments, authError]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7F6' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (authError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7F6' }}>
        <View style={{ padding: 20, alignItems: 'center' }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 8, height: 8, backgroundColor: '#EF4444', borderRadius: 4 }} />
          </View>
          <View style={{ fontSize: 16, fontWeight: '700', color: '#1A202C', marginBottom: 8 }}>Connection error</View>
          <View style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 }}>Trying to reconnect...</View>
          <View style={{ backgroundColor: '#1D9E75', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }} onTouchEnd={() => { setAuthError(false); setLoading(true); }}>
            <View style={{ color: '#fff', fontWeight: '600' }}>Retry</View>
          </View>
        </View>
      </View>
    );
  }

  return <Slot />;
}