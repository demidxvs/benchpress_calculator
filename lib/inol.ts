export type InolLevel = "очень легко" | "легко" | "умеренно" | "тяжело" | "очень тяжело";

export type InolInput = {
  weight: number;
  oneRepMax: number;
  reps: number;
  sets: number;
};

export type InolResult = {
  percent1RM: number;
  totalReps: number;
  denominator: number | null;
  inol: number | null;
  maxAttempt: boolean;
  level: InolLevel | null;
};

export type WorkoutSet = {
  id: string;
  weekId: number;
  sessionId: number;
  exercise: string;
  weight: number;
  oneRepMax: number;
  reps: number;
  sets: number;
};

export class InolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InolValidationError";
  }
}

export function interpretInol(inol: number): InolLevel {
  if (inol < 0.4) return "очень легко";
  if (inol < 0.7) return "легко";
  if (inol < 1.0) return "умеренно";
  if (inol <= 1.5) return "тяжело";
  return "очень тяжело";
}

export function calculateInol(input: InolInput): InolResult {
  const { weight, oneRepMax, reps, sets } = input;

  if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) {
    throw new InolValidationError("one_rep_max must be > 0");
  }

  if (!Number.isFinite(weight) || weight < 0) {
    throw new InolValidationError("weight must be >= 0");
  }

  if (!Number.isFinite(reps) || reps < 0 || !Number.isFinite(sets) || sets < 0) {
    throw new InolValidationError("reps and sets must be >= 0");
  }

  const percent1RM = (weight / oneRepMax) * 100;
  const totalReps = sets * reps;

  if (percent1RM >= 100) {
    return {
      percent1RM,
      totalReps,
      denominator: null,
      inol: null,
      maxAttempt: true,
      level: null,
    };
  }

  const rawDenominator = 100 - percent1RM;
  const denominator = Math.max(rawDenominator, 0.5);
  const inol = totalReps / denominator;

  return {
    percent1RM,
    totalReps,
    denominator,
    inol,
    maxAttempt: false,
    level: interpretInol(inol),
  };
}

export function aggregateInolByExercise(sets: WorkoutSet[]): Record<string, number> {
  return sets.reduce<Record<string, number>>((acc, set) => {
    const result = calculateInol(set);
    if (result.inol === null) return acc;
    acc[set.exercise] = (acc[set.exercise] ?? 0) + result.inol;
    return acc;
  }, {});
}

export function aggregateInolBySession(sets: WorkoutSet[]): Record<string, number> {
  return sets.reduce<Record<string, number>>((acc, set) => {
    const result = calculateInol(set);
    if (result.inol === null) return acc;
    acc[set.sessionId] = (acc[set.sessionId] ?? 0) + result.inol;
    return acc;
  }, {});
}

export function calculateWeeklyInol(sets: WorkoutSet[]): number {
  return sets.reduce((sum, set) => {
    const result = calculateInol(set);
    return sum + (result.inol ?? 0);
  }, 0);
}

export function weeklyRecommendation(weeklyInol: number): string {
  if (weeklyInol > 3.5) return "Высокий риск перегруза";
  if (weeklyInol >= 2.0 && weeklyInol <= 3.0) return "Нормальный диапазон";
  return "Ниже целевого диапазона, проверьте план";
}
