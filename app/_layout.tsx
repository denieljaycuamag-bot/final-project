// app/_layout.tsx
import { useEffect, useState } from 'react';
import { Slot } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/services/firebase';

export default function RootLayout() {
  const [user, setUser]       = useState<User | null>(null);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (isMounted) {
        setUser(firebaseUser);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Intentionally do not perform programmatic navigation here.
  // Route decisions are performed by individual route components
  // (for example `app/index.tsx` renders the login screen directly),
  // which avoids navigating before the root navigator mounts on web.

  return <Slot />;
}