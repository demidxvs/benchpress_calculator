"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type DayOfWeek,
  InolValidationError,
  aggregateInolByExercise,
  aggregateInolByDay,
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

type NewSetDraft = {
  weekId: string;
  dayOfWeek: DayOfWeek;
  exercise: "Bench Press";
  weight: string;
  reps: string;
  sets: string;
};

const DAY_OF_WEEK_OPTIONS: DayOfWeek[] = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const EXERCISE_OPTIONS = ["Bench Press"] as const;

type SavedDataFile = {
  version: 1;
  savedAt: string;
  oneRepMaxInput: string;
  roundStepInput: string;
  sets: Array<{
    id?: string;
    weekId: number;
    dayOfWeek: string;
    exercise?: string;
    weight: number;
    reps: number;
    sets: number;
  }>;
};

const PRILEPIN_ZONES: Zone[] = [
  { title: "> 90%", minPercent: 90, maxPercent: 100, reps: "1-2", optimalKpsh: 7, kpshRange: "4-10" },
  { title: "80-90%", minPercent: 80, maxPercent: 90, reps: "2-4", optimalKpsh: 15, kpshRange: "10-24" },
  { title: "70-80%", minPercent: 70, maxPercent: 80, reps: "3-6", optimalKpsh: 18, kpshRange: "12-24" },
  { title: "55-65%", minPercent: 55, maxPercent: 65, reps: "3-6", optimalKpsh: 24, kpshRange: "18-30" },
];

const DAILY_INOL_GUIDE = [
  { range: "< 0.4", note: "Слишком легко, стимул может быть недостаточным" },
  { range: "0.4 - 1.0", note: "Оптимально для стабильного прогресса" },
  { range: "1.0 - 2.0", note: "Тяжелый день, использовать короткими блоками" },
  { range: "> 2.0", note: "Очень тяжело, использовать редко" },
];

const WEEKLY_INOL_GUIDE = [
  { range: "< 2.0", note: "Легкая неделя, восстановление или делоад" },
  { range: "2.0 - 3.0", note: "Нормальная недельная нагрузка" },
  { range: "3.0 - 4.0", note: "Высокая усталость, применять ограниченно" },
  { range: "> 4.0", note: "Риск перегруза, нужен контроль восстановления" },
];

function roundToStep(weight: number, step: number) {
  return Math.round(weight / step) * step;
}

function format(n: number) {
  return n.toFixed(2);
}

function parseNumericInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    return Number.NaN;
  }
  const normalized = trimmed.replace(",", ".");
  return Number(normalized);
}

function inputNumberValue(value: number): number | "" {
  return Number.isFinite(value) ? value : "";
}

function safeDraftNumber(value: number | undefined, fallback: number): string {
  return Number.isFinite(value) ? String(value) : String(fallback);
}

export default function Home() {
  const [oneRepMaxInput, setOneRepMaxInput] = useState("127");
  const [roundStepInput, setRoundStepInput] = useState("2.5");
  const [setRows, setSetRows] = useState<WorkoutSet[]>([
    {
      id: "s1",
      weekId: 1,
      dayOfWeek: "Понедельник",
      exercise: "Bench Press",
      weight: 100,
      reps: 5,
      sets: 4,
    },
  ]);
  const [isAddSetModalOpen, setIsAddSetModalOpen] = useState(false);
  const [addSetError, setAddSetError] = useState<string | null>(null);
  const [dataFileError, setDataFileError] = useState<string | null>(null);
  const loadFileInputRef = useRef<HTMLInputElement | null>(null);
  const [newSetDraft, setNewSetDraft] = useState<NewSetDraft>({
    weekId: "1",
    dayOfWeek: "Понедельник",
    exercise: "Bench Press",
    weight: "80",
    reps: "5",
    sets: "3",
  });

  const oneRepMax = Number(oneRepMaxInput);
  const roundStep = Number(roundStepInput);

  const prilepinRows = useMemo(() => {
    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return [];
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
        const result = calculateInol({ ...set, oneRepMax });
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

    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) {
      return {
        perSet,
        exerciseTotals: {},
        dayTotals: {},
        weeklyInol: 0,
        weeklyLabel: weeklyRecommendation(0),
      };
    }

    const validSets = perSet.filter((item) => !item.error).map((item) => item.set);
    const exerciseTotals = aggregateInolByExercise(validSets, oneRepMax);
    const dayTotals = aggregateInolByDay(validSets, oneRepMax);
    const weeklyInol = calculateWeeklyInol(validSets, oneRepMax);

    return {
      perSet,
      exerciseTotals,
      dayTotals,
      weeklyInol,
      weeklyLabel: weeklyRecommendation(weeklyInol),
    };
  }, [oneRepMax, setRows]);

  const dailyInol = useMemo(() => {
    return Object.values(inolData.dayTotals).reduce((sum, val) => sum + val, 0);
  }, [inolData.dayTotals]);

  function closeAddSetModal() {
    setIsAddSetModalOpen(false);
    setAddSetError(null);
  }

  useEffect(() => {
    if (!isAddSetModalOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAddSetModal();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAddSetModalOpen]);

  function updateRow(id: string, key: keyof WorkoutSet, value: string) {
    setSetRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (key === "weight" || key === "reps" || key === "sets" || key === "weekId") {
          return { ...row, [key]: parseNumericInput(value) };
        }
        return { ...row, [key]: value };
      }),
    );
  }

  function openAddSetModal() {
    const lastSet = setRows[setRows.length - 1];
    setNewSetDraft({
      weekId: safeDraftNumber(lastSet?.weekId, 1),
      dayOfWeek: lastSet?.dayOfWeek ?? "Понедельник",
      exercise: "Bench Press",
      weight: safeDraftNumber(lastSet?.weight, 80),
      reps: safeDraftNumber(lastSet?.reps, 5),
      sets: safeDraftNumber(lastSet?.sets, 3),
    });
    setAddSetError(null);
    setIsAddSetModalOpen(true);
  }

  function updateNewSetDraft(key: keyof NewSetDraft, value: string) {
    setNewSetDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleOneRepMaxInputChange(value: string) {
    setOneRepMaxInput(value);
  }

  function saveNewSet() {
    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) {
      setAddSetError("Сначала укажите корректный 1ПМ в таблице Прилепина.");
      return;
    }

    const candidate = {
      weekId: parseNumericInput(newSetDraft.weekId),
      dayOfWeek: newSetDraft.dayOfWeek,
      exercise: newSetDraft.exercise.trim(),
      weight: parseNumericInput(newSetDraft.weight),
      reps: parseNumericInput(newSetDraft.reps),
      sets: parseNumericInput(newSetDraft.sets),
    };

    if (!candidate.exercise) {
      setAddSetError("Укажите название упражнения.");
      return;
    }

    if (!Number.isFinite(candidate.weekId) || candidate.weekId < 1) {
      setAddSetError("Неделя должна быть больше или равна 1.");
      return;
    }

    if (!Number.isFinite(candidate.weight) || candidate.weight < 0) {
      setAddSetError("Вес должен быть больше или равен 0.");
      return;
    }

    if (!Number.isFinite(candidate.sets) || candidate.sets < 0) {
      setAddSetError("Сеты должны быть больше или равны 0.");
      return;
    }

    if (!Number.isFinite(candidate.reps) || candidate.reps < 0) {
      setAddSetError("Повторы должны быть больше или равны 0.");
      return;
    }

    try {
      calculateInol({ ...candidate, oneRepMax });
      setSetRows((prev) => [...prev, { id: `s${Date.now()}`, ...candidate }]);
      closeAddSetModal();
    } catch (error) {
      if (error instanceof InolValidationError) {
        setAddSetError(error.message);
        return;
      }
      setAddSetError("Не удалось сохранить сет.");
    }
  }

  function removeRow(id: string) {
    setSetRows((prev) => prev.filter((row) => row.id !== id));
  }

  function dayOfWeekFromUnknown(value: unknown): DayOfWeek {
    if (typeof value === "string" && DAY_OF_WEEK_OPTIONS.includes(value as DayOfWeek)) {
      return value as DayOfWeek;
    }
    throw new Error("Неверный день недели в файле.");
  }

  function setFromUnknown(value: unknown, index: number): WorkoutSet {
    if (!value || typeof value !== "object") {
      throw new Error(`Строка ${index + 1}: неверный формат.`);
    }

    const raw = value as Record<string, unknown>;
    const weekId = Number(raw.weekId);
    const weight = Number(raw.weight);
    const reps = Number(raw.reps);
    const sets = Number(raw.sets);

    if (!Number.isFinite(weekId) || weekId < 1) {
      throw new Error(`Строка ${index + 1}: неделя должна быть >= 1.`);
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Строка ${index + 1}: вес должен быть >= 0.`);
    }
    if (!Number.isFinite(reps) || reps < 0) {
      throw new Error(`Строка ${index + 1}: повторы должны быть >= 0.`);
    }
    if (!Number.isFinite(sets) || sets < 0) {
      throw new Error(`Строка ${index + 1}: сеты должны быть >= 0.`);
    }

    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `s${Date.now()}-${index}`,
      weekId,
      dayOfWeek: dayOfWeekFromUnknown(raw.dayOfWeek),
      exercise: "Bench Press",
      weight,
      reps,
      sets,
    };
  }

  function saveDataToFile() {
    const payload: SavedDataFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      oneRepMaxInput,
      roundStepInput,
      sets: setRows.map((row) => ({
        id: row.id,
        weekId: row.weekId,
        dayOfWeek: row.dayOfWeek,
        exercise: "Bench Press",
        weight: row.weight,
        reps: row.reps,
        sets: row.sets,
      })),
    };

    const datePart = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `benchpress-data-${datePart}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDataFileError(null);
  }

  function openLoadDataDialog() {
    loadFileInputRef.current?.click();
  }

  async function handleLoadDataFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SavedDataFile> & { setRows?: unknown[] };

      const loadedRawSets = Array.isArray(parsed.sets) ? parsed.sets : Array.isArray(parsed.setRows) ? parsed.setRows : null;
      if (!loadedRawSets) {
        throw new Error("Файл не содержит массив сетов.");
      }

      const loadedSets = loadedRawSets.map((row, index) => setFromUnknown(row, index));

      const nextOneRepMax =
        typeof parsed.oneRepMaxInput === "string"
          ? parsed.oneRepMaxInput
          : Number.isFinite((parsed as { oneRepMax?: unknown }).oneRepMax)
            ? String((parsed as { oneRepMax?: number }).oneRepMax)
            : oneRepMaxInput;
      const nextRoundStep =
        typeof parsed.roundStepInput === "string"
          ? parsed.roundStepInput
          : Number.isFinite((parsed as { roundStep?: unknown }).roundStep)
            ? String((parsed as { roundStep?: number }).roundStep)
            : roundStepInput;

      setOneRepMaxInput(nextOneRepMax);
      setRoundStepInput(nextRoundStep);
      setSetRows(loadedSets);
      setDataFileError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      setDataFileError(`Не удалось загрузить файл: ${message}`);
    } finally {
      event.target.value = "";
    }
  }

  const addSetPreview = useMemo(() => {
    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return null;
    try {
      const candidate = {
        weight: parseNumericInput(newSetDraft.weight),
        oneRepMax,
        reps: parseNumericInput(newSetDraft.reps),
        sets: parseNumericInput(newSetDraft.sets),
      };
      const result = calculateInol(candidate);
      return result;
    } catch {
      return null;
    }
  }, [newSetDraft.reps, newSetDraft.sets, newSetDraft.weight, oneRepMax]);

  function handleModalKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveNewSet();
    }
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
              <input type="number" min="1" step="0.5" value={oneRepMaxInput} onChange={(e) => handleOneRepMaxInputChange(e.target.value)} />
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
            <h2>INOL калькулятор</h2>
            <div className="sectionActions">
              <button type="button" className="btnSecondary" onClick={saveDataToFile}>
                Сохранить в файл
              </button>
              <button type="button" className="btnSecondary" onClick={openLoadDataDialog}>
                Загрузить файл
              </button>
              <button type="button" className="btnPrimary" onClick={openAddSetModal}>
                + Добавить сет
              </button>
            </div>
          </div>
          <p className="inolOneRmNote">1ПМ для всех сетов берется из поля выше: {Number.isFinite(oneRepMax) ? format(oneRepMax) : "-"} кг.</p>
          <input ref={loadFileInputRef} type="file" accept="application/json" className="hiddenFileInput" onChange={handleLoadDataFile} />
          {dataFileError && <p className="dataFileError">{dataFileError}</p>}

          {isAddSetModalOpen && (
            <div className="addSetOverlay" role="presentation" onClick={closeAddSetModal}>
              <div className="addSetModal" role="dialog" aria-modal="true" aria-label="Добавить сет" onClick={(e) => e.stopPropagation()} onKeyDown={handleModalKeyDown}>
                <div className="addSetModalHeader">
                  <div>
                    <h3>Добавить новый сет</h3>
                    <p>Введите параметры, затем нажмите Enter или кнопку сохранения.</p>
                  </div>
                  <button type="button" className="popoverClose btnSecondary" onClick={closeAddSetModal} aria-label="Закрыть форму">
                    x
                  </button>
                </div>

                <div className="modalGrid">
                  <label>
                    Неделя
                    <input type="number" min="1" step="1" value={newSetDraft.weekId} onChange={(e) => updateNewSetDraft("weekId", e.target.value)} />
                  </label>
                  <label>
                    День недели
                    <select value={newSetDraft.dayOfWeek} onChange={(e) => updateNewSetDraft("dayOfWeek", e.target.value as DayOfWeek)}>
                      {DAY_OF_WEEK_OPTIONS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="modalWide">
                    Упражнение
                    <select value={newSetDraft.exercise} onChange={() => updateNewSetDraft("exercise", "Bench Press")}>
                      {EXERCISE_OPTIONS.map((exercise) => (
                        <option key={exercise} value={exercise}>
                          {exercise}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Вес (кг)
                    <input type="number" min="0" step="0.5" value={newSetDraft.weight} onChange={(e) => updateNewSetDraft("weight", e.target.value)} />
                  </label>
                  <label>
                    Сеты
                    <input type="number" min="0" step="1" value={newSetDraft.sets} onChange={(e) => updateNewSetDraft("sets", e.target.value)} />
                  </label>
                  <label>
                    Повторы
                    <input type="number" min="0" step="1" value={newSetDraft.reps} onChange={(e) => updateNewSetDraft("reps", e.target.value)} />
                  </label>
                </div>

                <div className="addSetPreview">
                  <p>
                    <strong>%1ПМ:</strong> {addSetPreview ? `${format(addSetPreview.percent1RM)}%` : "-"}
                  </p>
                  <p>
                    <strong>INOL:</strong>{" "}
                    {addSetPreview
                      ? addSetPreview.maxAttempt
                        ? "Максимальная попытка"
                        : addSetPreview.inol === null
                          ? "-"
                          : format(addSetPreview.inol)
                      : "-"}
                  </p>
                </div>

                {addSetError && <p className="modalError">{addSetError}</p>}

                <div className="modalActions">
                  <button type="button" className="btnSecondary" onClick={closeAddSetModal}>
                    Отмена
                  </button>
                  <button type="button" className="btnPrimary" onClick={saveNewSet}>
                    Сохранить сет
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="tableWrap">
            <table className="inolTable">
              <thead>
                <tr>
                  <th>Неделя</th>
                  <th>День</th>
                  <th>Упражнение</th>
                  <th>Вес</th>
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
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={inputNumberValue(item.set.weekId)}
                        onChange={(e) => updateRow(item.set.id, "weekId", e.target.value)}
                      />
                    </td>
                    <td data-label="День">
                      <select value={item.set.dayOfWeek} onChange={(e) => updateRow(item.set.id, "dayOfWeek", e.target.value)}>
                        {DAY_OF_WEEK_OPTIONS.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Упражнение">
                      <select value="Bench Press" onChange={() => updateRow(item.set.id, "exercise", "Bench Press")}>
                        {EXERCISE_OPTIONS.map((exercise) => (
                          <option key={exercise} value={exercise}>
                            {exercise}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Вес">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={inputNumberValue(item.set.weight)}
                        onChange={(e) => updateRow(item.set.id, "weight", e.target.value)}
                      />
                    </td>
                    <td data-label="Сеты">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={inputNumberValue(item.set.sets)}
                        onChange={(e) => updateRow(item.set.id, "sets", e.target.value)}
                      />
                    </td>
                    <td data-label="Повт.">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={inputNumberValue(item.set.reps)}
                        onChange={(e) => updateRow(item.set.id, "reps", e.target.value)}
                      />
                    </td>
                    <td data-label="%1ПМ">{item.percent === null ? "-" : `${format(item.percent)}%`}</td>
                    <td data-label="INOL">{item.maxAttempt ? "Максимальная попытка" : item.inol === null ? "-" : format(item.inol)}</td>
                    <td data-label="Уровень">{item.maxAttempt ? "max" : item.level ?? "-"}</td>
                    <td data-label="Действие">
                      <button type="button" className="btnDanger" onClick={() => removeRow(item.set.id)}>
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
              <h3>По дню</h3>
              {Object.entries(inolData.dayTotals).map(([day, total]) => (
                <p key={day}>
                  {day}: {format(total)} ({interpretInol(total)})
                </p>
              ))}
            </article>

            <article>
              <h3>По неделе</h3>
              <p>Недельный INOL: {format(inolData.weeklyInol)}</p>
              <p>{inolData.weeklyLabel}</p>
            </article>
          </div>

          <div className="formula">
            <p>
              Формула: <code>INOL = total_reps / (100 - percent_1RM)</code>
            </p>
            <p>
              где <code>percent_1RM = (weight / one_rep_max) * 100</code>, <code>total_reps = sets * reps</code>.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2>Шкала INOL (ориентир)</h2>
          <div className="guideNow">
            <p>
              За день: <strong>{format(dailyInol)}</strong>
            </p>
            <p>
              За неделю: <strong>{format(inolData.weeklyInol)}</strong>
            </p>
          </div>

          <div className="guideGrid">
            <article>
              <h3>Норма за день</h3>
              <div className="tableWrap">
                <table className="guideTable">
                  <thead>
                    <tr>
                      <th>INOL</th>
                      <th>Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAILY_INOL_GUIDE.map((row) => (
                      <tr key={row.range}>
                        <td>{row.range}</td>
                        <td>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article>
              <h3>Норма за неделю</h3>
              <div className="tableWrap">
                <table className="guideTable">
                  <thead>
                    <tr>
                      <th>INOL</th>
                      <th>Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKLY_INOL_GUIDE.map((row) => (
                      <tr key={row.range}>
                        <td>{row.range}</td>
                        <td>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>

        <footer className="authorNote">Создал Артем Демидов</footer>
      </main>

    </div>
  );
}
