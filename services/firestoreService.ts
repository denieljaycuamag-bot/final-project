import {
  collection, addDoc, getDocs, getDoc, doc,
  query, where, orderBy, updateDoc, setDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ── TYPES ────────────────────────────────────────────────────────
export interface UserProfile {
  name: string;
  nickname?: string;
  email: string;
  age: number;
  weight: number;
  goal: string;
  createdAt: Date;
}

export interface Workout {
  id?: string;
  uid: string;
  exercise: string;
  distance_km: number | null;
  duration_min: number | null;
  reps: number | null;
  sets: number | null;
  calories: number;
  date: Date;
}

export interface Goal {
  id?: string;
  uid: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  type?: string;
  deadline: Date;
  createdAt?: Date;
}

export interface GoalLog {
  id?: string;
  goalId?: string;
  uid: string;
  value: number;
  date: Date;
  note?: string;
}

export interface NutritionEntry {
  id?: string;
  uid: string;
  food: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: Date;
}

// ── USER PROFILE ─────────────────────────────────────────────────
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDocs(query(collection(db, 'users'), where('__name__', '==', uid)));
  return snap.empty ? null : (snap.docs[0].data() as UserProfile);
};

export const updateUserProfile = async (uid: string, profile: Partial<UserProfile>) => {
  await setDoc(doc(db, 'users', uid), profile, { merge: true });
};

// ── WORKOUTS ─────────────────────────────────────────────────────
export const saveWorkout = async (workout: Omit<Workout, 'id'>) => {
  await addDoc(collection(db, 'workouts'), { ...workout, date: new Date() });
};

export const getWorkouts = async (uid: string): Promise<Workout[]> => {
  const snap = await getDocs(
    query(collection(db, 'workouts'), where('uid', '==', uid), orderBy('date', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workout));
};

export const getWorkoutsThisWeek = async (uid: string): Promise<Workout[]> => {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const snap = await getDocs(collection(db, 'workouts'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Workout))
    .filter((workout) => workout.uid === uid)
    .filter((workout) => {
      const date = workout.date instanceof Date ? workout.date : (workout.date as any)?.toDate?.() ?? new Date(workout.date as any);
      return date >= start;
    })
    .sort((a, b) => {
      const aDate = a.date instanceof Date ? a.date.getTime() : new Date(a.date as any).getTime();
      const bDate = b.date instanceof Date ? b.date.getTime() : new Date(b.date as any).getTime();
      return bDate - aDate;
    });
};

// ── GOALS ────────────────────────────────────────────────────────
export const saveGoal = async (goal: Omit<Goal, 'id'>) => {
  await addDoc(collection(db, 'goals'), {
    ...goal,
    createdAt: goal.createdAt ?? new Date(),
    type: goal.type ?? goal.unit,
  });
};

export const getGoals = async (uid: string): Promise<Goal[]> => {
  const snap = await getDocs(collection(db, 'goals'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Goal))
    .filter((goal) => goal.uid === uid)
    .sort((a, b) => {
      const aDate = a.deadline instanceof Date ? a.deadline.getTime() : new Date(a.deadline as any).getTime();
      const bDate = b.deadline instanceof Date ? b.deadline.getTime() : new Date(b.deadline as any).getTime();
      return aDate - bDate;
    });
};

export const updateGoalProgress = async (goalId: string, current: number) => {
  await updateDoc(doc(db, 'goals', goalId), { current });
};

export const updateGoal = async (goalId: string, data: Partial<Goal>) => {
  await updateDoc(doc(db, 'goals', goalId), {
    ...data,
    type: data.type ?? data.unit,
  });
};

export const deleteGoal = async (goalId: string) => {
  await deleteDoc(doc(db, 'goals', goalId));
};

// Delete goal document and all its logs (cascade delete).
export const deleteGoalWithLogs = async (goalId: string) => {
  // Get logs under goals/<goalId>/logs
  const logsRef = collection(db, 'goals', goalId, 'logs');
  const snap = await getDocs(logsRef);
  if (snap.empty) {
    await deleteDoc(doc(db, 'goals', goalId));
    return;
  }

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(doc(db, 'goals', goalId, 'logs', d.id)));
  batch.delete(doc(db, 'goals', goalId));
  await batch.commit();
};

export const getGoalById = async (goalId: string): Promise<Goal | null> => {
  const snap = await getDoc(doc(db, 'goals', goalId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Goal) : null;
};

export const saveGoalLog = async (goalId: string, log: Omit<GoalLog, 'id'>) => {
  await addDoc(collection(db, 'goals', goalId, 'logs'), { ...log, goalId });
};

export const getGoalLogs = async (goalId: string): Promise<GoalLog[]> => {
  const snap = await getDocs(query(collection(db, 'goals', goalId, 'logs'), orderBy('date', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoalLog));
};

// ── NUTRITION ────────────────────────────────────────────────────
export const saveNutrition = async (entry: Omit<NutritionEntry, 'id'>) => {
  await addDoc(collection(db, 'nutrition'), { ...entry, date: new Date() });
};

export const getNutritionToday = async (uid: string): Promise<NutritionEntry[]> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const snap = await getDocs(collection(db, 'nutrition'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as NutritionEntry))
    .filter((entry) => entry.uid === uid)
    .filter((entry) => {
      const date = entry.date instanceof Date ? entry.date : (entry.date as any)?.toDate?.() ?? new Date(entry.date as any);
      return date >= start;
    })
    .sort((a, b) => {
      const aDate = a.date instanceof Date ? a.date.getTime() : new Date(a.date as any).getTime();
      const bDate = b.date instanceof Date ? b.date.getTime() : new Date(b.date as any).getTime();
      return bDate - aDate;
    });
};

// ── CHAT ─────────────────────────────────────────────────────────
export const saveChatMessage = async (uid: string, message: any) => {
  const chatRef = doc(db, 'users', uid, 'chats', message.id);
  await setDoc(chatRef, message);
};

export const getChatMessages = async (uid: string) => {
  const chatsRef = collection(db, 'users', uid, 'chats');
  const q = query(chatsRef, orderBy('createdAt', 'asc'));
  const querySnapshot = await getDocs(q);
  
  const messages: any[] = [];
  querySnapshot.forEach((doc) => {
    messages.push(doc.data());
  });
  
  return messages;
};