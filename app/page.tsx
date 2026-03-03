"use client";

import { useMemo, useState } from "react";
import {
  InolValidationError,
  aggregateInolByExercise,
  aggregateInolBySession,
  calculateInol,
  calculateWeeklyInol,
  interpretInol,
  type WorkoutSet,
  weeklyRecommendation,
} from "../lib/inol";

type Zone = {
  title: string;
  minPercent: number;
  maxPercent: number;
  reps: string;
  optimalKpsh: number;
  kpshRange: string;
};

type SetWithResult = {
  set: WorkoutSet;
  error: string | null;
  percent: number | null;
  inol: number | null;
  maxAttempt: boolean;
  level: string | null;
};

const PRILEPIN_ZONES: Zone[] = [
  { title: "> 90%", minPercent: 90, maxPercent: 100, reps: "1-2", optimalKpsh: 7, kpshRange: "4-10" },
  { title: "80-90%", minPercent: 80, maxPercent: 90, reps: "2-4", optimalKpsh: 15, kpshRange: "10-24" },
  { title: "70-80%", minPercent: 70, maxPercent: 80, reps: "3-6", optimalKpsh: 18, kpshRange: "12-24" },
  { title: "55-65%", minPercent: 55, maxPercent: 65, reps: "3-6", optimalKpsh: 24, kpshRange: "18-30" },
];

function roundToStep(weight: number, step: number) {
  return Math.round(weight / step) * step;
}

function format(n: number) {
  return n.toFixed(2);
}

export default function Home() {
  const [oneRepMaxInput, setOneRepMaxInput] = useState("127");
  const [roundStepInput, setRoundStepInput] = useState("2.5");
  const [setRows, setSetRows] = useState<WorkoutSet[]>([
    {
      id: "s1",
      weekId: 1,
      sessionId: 1,
      exercise: "Bench Press",
      weight: 100,
      oneRepMax: 127,
      reps: 5,
      sets: 4,
    },
  ]);

  const oneRepMax = Number(oneRepMaxInput);
  const roundStep = Number(roundStepInput);

  const prilepinRows = useMemo(() => {
    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) {
      return [];
    }

    const safeStep = Number.isFinite(roundStep) && roundStep > 0 ? roundStep : 2.5;
    return PRILEPIN_ZONES.map((zone) => ({
      ...zone,
      minWeight: roundToStep((oneRepMax * zone.minPercent) / 100, safeStep),
      maxWeight: roundToStep((oneRepMax * zone.maxPercent) / 100, safeStep),
    }));
  }, [oneRepMax, roundStep]);

  const inolData = useMemo(() => {
    const perSet: SetWithResult[] = setRows.map((set) => {
      try {
        const result = calculateInol(set);
        return {
          set,
          error: null,
          percent: result.percent1RM,
          inol: result.inol,
          maxAttempt: result.maxAttempt,
          level: result.level,
        };
      } catch (error) {
        if (error instanceof InolValidationError) {
          return { set, error: error.message, percent: null, inol: null, maxAttempt: false, level: null };
        }
        return { set, error: "unknown error", percent: null, inol: null, maxAttempt: false, level: null };
      }
    });

    const validSets = perSet.filter((item) => !item.error).map((item) => item.set);
    const exerciseTotals = aggregateInolByExercise(validSets);
    const sessionTotals = aggregateInolBySession(validSets);
    const weeklyInol = calculateWeeklyInol(validSets);

    return {
      perSet,
      exerciseTotals,
      sessionTotals,
      weeklyInol,
      weeklyLabel: weeklyRecommendation(weeklyInol),
    };
  }, [setRows]);

  function updateRow(id: string, key: keyof WorkoutSet, value: string) {
    setSetRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (key === "weight" || key === "oneRepMax" || key === "reps" || key === "sets") {
          return { ...row, [key]: Number(value) };
        }
        if (key === "weekId" || key === "sessionId") {
          return { ...row, [key]: Number(value) };
        }
        return { ...row, [key]: value };
      }),
    );
  }

  function addSetRow() {
    setSetRows((prev) => [
      ...prev,
      {
        id: `s${Date.now()}`,
        weekId: 1,
        sessionId: 1,
        exercise: "Bench Press",
        weight: 80,
        oneRepMax: 127,
        reps: 5,
        sets: 3,
      },
    ]);
  }

  function removeRow(id: string) {
    setSetRows((prev) => prev.filter((row) => row.id !== id));
  }

  return (
    <div className="app">
      <main className="container">
        <header className="header">
          <h1>Таблица Прилепина & INOL</h1>
          <p>Минималистичный калькулятор: таблица Прилепина + INOL по сетам, тренировке и неделе.</p>
        </header>

        <section className="panel">
          <h2>Таблица Прилепина</h2>
          <div className="inputs">
            <label>
              1ПМ (кг)
              <input type="number" min="1" step="0.5" value={oneRepMaxInput} onChange={(e) => setOneRepMaxInput(e.target.value)} />
            </label>
            <label>
              Шаг округления (кг)
              <input type="number" min="0.5" step="0.5" value={roundStepInput} onChange={(e) => setRoundStepInput(e.target.value)} />
            </label>
          </div>

          <div className="tableWrap">
            <table className="prilepinTable">
              <thead>
                <tr>
                  <th>Интенсивность</th>
                  <th>Вес</th>
                  <th>Повторения</th>
                  <th>Опт. КПШ</th>
                  <th>КПШ</th>
                </tr>
              </thead>
              <tbody>
                {prilepinRows.map((row) => (
                  <tr key={row.title}>
                    <td>{row.title}</td>
                    <td>{row.minWeight === row.maxWeight ? `${row.maxWeight} кг` : `${row.minWeight}-${row.maxWeight} кг`}</td>
                    <td>{row.reps}</td>
                    <td>{row.optimalKpsh}</td>
                    <td>{row.kpshRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="sectionRow">
            <h2>INOL Калькулятор</h2>
            <button type="button" onClick={addSetRow}>
              + Добавить сет
            </button>
          </div>

          <div className="tableWrap">
            <table className="inolTable">
              <thead>
                <tr>
                  <th>Неделя</th>
                  <th>Сессия</th>
                  <th>Упражнение</th>
                  <th>Вес</th>
                  <th>1ПМ</th>
                  <th>Сеты</th>
                  <th>Повт.</th>
                  <th>%1ПМ</th>
                  <th>INOL</th>
                  <th>Уровень</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inolData.perSet.map((item) => (
                  <tr key={item.set.id}>
                    <td data-label="Неделя">
                      <input type="number" min="1" step="1" value={item.set.weekId} onChange={(e) => updateRow(item.set.id, "weekId", e.target.value)} />
                    </td>
                    <td data-label="Сессия">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.set.sessionId}
                        onChange={(e) => updateRow(item.set.id, "sessionId", e.target.value)}
                      />
                    </td>
                    <td data-label="Упражнение">
                      <input value={item.set.exercise} onChange={(e) => updateRow(item.set.id, "exercise", e.target.value)} />
                    </td>
                    <td data-label="Вес">
                      <input type="number" min="0" step="0.5" value={item.set.weight} onChange={(e) => updateRow(item.set.id, "weight", e.target.value)} />
                    </td>
                    <td data-label="1ПМ">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.set.oneRepMax}
                        onChange={(e) => updateRow(item.set.id, "oneRepMax", e.target.value)}
                      />
                    </td>
                    <td data-label="Сеты">
                      <input type="number" min="0" step="1" value={item.set.sets} onChange={(e) => updateRow(item.set.id, "sets", e.target.value)} />
                    </td>
                    <td data-label="Повт.">
                      <input type="number" min="0" step="1" value={item.set.reps} onChange={(e) => updateRow(item.set.id, "reps", e.target.value)} />
                    </td>
                    <td data-label="%1ПМ">{item.percent === null ? "-" : `${format(item.percent)}%`}</td>
                    <td data-label="INOL">{item.maxAttempt ? "Max Attempt" : item.inol === null ? "-" : format(item.inol)}</td>
                    <td data-label="Уровень">{item.maxAttempt ? "max" : item.level ?? "-"}</td>
                    <td data-label="Действие">
                      <button type="button" onClick={() => removeRow(item.set.id)}>
                        удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inolData.perSet.some((item) => item.error) && (
            <div className="errors">
              {inolData.perSet
                .filter((item) => item.error)
                .map((item) => (
                  <p key={item.set.id}>
                    {item.set.id}: {item.error}
                  </p>
                ))}
            </div>
          )}

          <div className="summaryGrid">
            <article>
              <h3>По упражнению</h3>
              {Object.entries(inolData.exerciseTotals).map(([exercise, total]) => (
                <p key={exercise}>
                  {exercise}: {format(total)} ({interpretInol(total)})
                </p>
              ))}
            </article>

            <article>
              <h3>По тренировке</h3>
              {Object.entries(inolData.sessionTotals).map(([session, total]) => (
                <p key={session}>
                  {session}: {format(total)} ({interpretInol(total)})
                </p>
              ))}
            </article>

            <article>
              <h3>По неделе</h3>
              <p>Weekly INOL: {format(inolData.weeklyInol)}</p>
              <p>{inolData.weeklyLabel}</p>
            </article>
          </div>

          <div className="formula">
            <p>
              Формула: <code>INOL = total_reps / (100 - percent_1RM)</code>
            </p>
            <p>
              where <code>percent_1RM = (weight / one_rep_max) * 100</code>, <code>total_reps = sets * reps</code>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
