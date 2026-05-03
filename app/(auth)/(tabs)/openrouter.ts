// services/openrouter.ts

// Load API key from Expo runtime config, public env, or process env. Do NOT commit secrets.
let OPENROUTER_API_KEY = '';
let OPENROUTER_KEY_SOURCE = 'none';
try {
  // Expo runtime config (app.json -> expo.extra)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Constants = require('expo-constants').default;
  const k = Constants?.expoConfig?.extra?.OPENROUTER_API_KEY || Constants?.manifest?.extra?.OPENROUTER_API_KEY;
  if (k) {
    OPENROUTER_API_KEY = k;
    OPENROUTER_KEY_SOURCE = 'expo';
  }
} catch {}
if (!OPENROUTER_API_KEY) {
  // Expo public env variables are exposed as EXPO_PUBLIC_*
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_OPENROUTER_API_KEY) {
    OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
    OPENROUTER_KEY_SOURCE = 'expo_public_env';
  } else if (typeof process !== 'undefined' && process.env.OPENROUTER_API_KEY) {
    OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    OPENROUTER_KEY_SOURCE = 'env';
  } else if ((global as any).OPENROUTER_API_KEY) {
    OPENROUTER_API_KEY = (global as any).OPENROUTER_API_KEY;
    OPENROUTER_KEY_SOURCE = 'global';
  }
}

// Small diagnostic (doesn't log the key itself)
try { console.warn('OPENROUTER_API_KEY present?', !!OPENROUTER_API_KEY, 'source:', OPENROUTER_KEY_SOURCE); } catch {}

const SUPPORTED_MODELS = [
     'arcee-ai/trinity-large-preview',
  'alfredpros/codellama-7b-instruct-solidity',
  'moonshotai/kimi-k2.6',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'stepfun/step-3.5-flash',
  'stepfun/step-3.5-flash',
  'arcee-ai/trinity-large-thinking',
];

const MODEL = (typeof process !== 'undefined' && process.env.OPENROUTER_MODEL && SUPPORTED_MODELS.includes(process.env.OPENROUTER_MODEL))
  ? process.env.OPENROUTER_MODEL
  : SUPPORTED_MODELS[0];

// MET values for calorie calculation
const MET_VALUES: Record<string, number> = {
  run:      9.8,
  running:  9.8,
  jog:      7.0,
  jogging:  7.0,
  walk:     3.5,
  walking:  3.5,
  swim:     8.3,
  swimming: 8.3,
  bike:     6.8,
  biking:   6.8,
  cycling:  6.8,
  cycle:    6.8,
  pushup:   3.8,
  squat:    5.0,
  plank:    4.0,
  default:  6.0,
};

export interface ExtractedWorkout {
  exercise: string;
  distance_km: number | null;
  duration_min: number | null;
  reps: number | null;
  sets: number | null;
}

export const calculateCalories = (
  exercise: string,
  duration_min: number | null,
  weight_kg: number,
  reps: number | null = null,
  sets: number | null = null
): number => {
  const ex = exercise.toLowerCase();
  let met = MET_VALUES.default;

  for (const key of Object.keys(MET_VALUES)) {
    if (ex.includes(key)) {
      met = MET_VALUES[key];
      break;
    }
  }

  // If no duration, estimate from reps
  let mins = duration_min;
  if (!mins && reps) {
    const totalReps = reps * (sets ?? 1);
    mins = totalReps / 25; // ~25 reps per minute
  }
  if (!mins) mins = 30; // fallback

  const hours = mins / 60;
  return Math.round(met * weight_kg * hours);
};

export const extractWorkoutFromText = async (userMessage: string): Promise<ExtractedWorkout | null> => {
  const systemPrompt = `You are a fitness data extractor. When the user describes a workout, extract:
- exercise (string): type of exercise (e.g. "running", "push-ups", "swimming")
- distance_km (number or null): distance in kilometers if mentioned
- duration_min (number or null): duration in minutes
- reps (number or null): number of reps if mentioned
- sets (number or null): number of sets if mentioned

Reply ONLY with a valid JSON object. No explanation, no extra text.
Example: {"exercise":"running","distance_km":5,"duration_min":28,"reps":null,"sets":null}`;

  try {
    if (!OPENROUTER_API_KEY) return null;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }),
    });

    const contentType = res.headers.get('content-type') || '';
    let raw = '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content ?? data.output?.[0]?.content ?? JSON.stringify(data);
    } else {
      raw = await res.text();
    }

    // Remove triple-backtick json blocks if present
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    const jsonText = first !== -1 && last !== -1 ? raw.slice(first, last + 1) : raw;
    try {
      return JSON.parse(jsonText) as ExtractedWorkout;
    } catch (err) {
      // fallback regex extraction
      const exMatch = /"?exercise"?\s*[:=]\s*"([^"]+)"/i.exec(raw);
      const distMatch = /([0-9]+(?:\.[0-9]+)?)\s*(?:km|kilometers|kilometres)/i.exec(raw);
      const durMatch = /([0-9]+)\s*(?:min|minutes)/i.exec(raw);
      const repsMatch = /([0-9]+)\s*(?:reps|rep|push-ups|pushups|push ups)/i.exec(raw);
      const setsMatch = /([0-9]+)\s*(?:sets)/i.exec(raw);
      const parsed: ExtractedWorkout = {
        exercise: exMatch?.[1] ?? 'exercise',
        distance_km: distMatch ? parseFloat(distMatch[1]) : null,
        duration_min: durMatch ? parseInt(durMatch[1], 10) : null,
        reps: repsMatch ? parseInt(repsMatch[1], 10) : null,
        sets: setsMatch ? parseInt(setsMatch[1], 10) : null,
      };
      return parsed;
    }
  } catch (e) {
    console.error('Error extracting workout from text:', e);
    return null;
  }
};

export const chatWithAI = async (
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string,
  modelOverride?: string
): Promise<string> => {
  if (!OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY present?', !!OPENROUTER_API_KEY, 'source:', OPENROUTER_KEY_SOURCE);
    return 'Missing OpenRouter API key.';
  }

  const tried = new Set<string>();
  const tryModel = async (m: string): Promise<string | null> => {
    try {
      console.debug('openrouter: trying model', m);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: m, messages: [{ role: 'system', content: systemPrompt }, ...messages] }),
      });

      const ct = res.headers.get('content-type') || '';
      let text: string | null = null;
      if (ct.includes('application/json')) {
        const j = await res.json();
        text = j.choices?.[0]?.message?.content ?? j.output?.[0]?.content ?? null;
      } else {
        text = await res.text();
      }

      if (!res.ok) {
        console.warn('openrouter: non-ok', res.status, text);
        return null;
      }
      return typeof text === 'string' ? text : null;
    } catch (err) {
      console.warn('openrouter: request error', err);
      return null;
    }
  };

  const candidates: string[] = [];
  if (modelOverride && SUPPORTED_MODELS.includes(modelOverride)) candidates.push(modelOverride);
  if (MODEL) candidates.push(MODEL);
  for (const m of SUPPORTED_MODELS) if (!candidates.includes(m)) candidates.push(m);

  for (const m of candidates) {
    if (tried.has(m)) continue;
    tried.add(m);
    const out = await tryModel(m);
    if (out) return out;
  }

  return "Sorry, I couldn't respond right now.";
};