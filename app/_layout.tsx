// app/_layout.tsx
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/services/firebase';

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (isMounted) {
        setUser(firebaseUser);
        setIsAuthLoaded(true);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (rootNavigationState?.key) {
      setIsReady(true);
    }
  }, [rootNavigationState?.key]);

  useEffect(() => {
    if (!isReady || !isAuthLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/chatbot');
    }
  }, [isReady, isAuthLoaded, user, segments, router]);

  if (!isReady || !isAuthLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return <Slot />;
}