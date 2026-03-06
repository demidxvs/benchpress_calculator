"use client";

import { useEffect, useMemo, useState } from "react";
import {
  InolValidationError,
  calculateInol,
  calculateWorkoutInol,
  interpretInol,
  type WorkoutSet,
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
  weight: string;
  reps: string;
  sets: string;
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
  { range: "1.0 - 2.0", note: "Тяжелая тренировка, использовать короткими блоками" },
  { range: "> 2.0", note: "Очень тяжело, применять редко" },
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
      exercise: "Bench Press",
      weight: 100,
      reps: 5,
      sets: 4,
    },
  ]);
  const [isAddSetModalOpen, setIsAddSetModalOpen] = useState(false);
  const [addSetError, setAddSetError] = useState<string | null>(null);
  const [newSetDraft, setNewSetDraft] = useState<NewSetDraft>({
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
        workoutInol: 0,
      };
    }

    const validSets = perSet.filter((item) => !item.error).map((item) => item.set);
    const workoutInol = calculateWorkoutInol(validSets, oneRepMax);

    return {
      perSet,
      workoutInol,
    };
  }, [oneRepMax, setRows]);

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
        if (key === "weight" || key === "reps" || key === "sets") {
          return { ...row, [key]: parseNumericInput(value) };
        }
        return row;
      }),
    );
  }

  function openAddSetModal() {
    const lastSet = setRows[setRows.length - 1];
    setNewSetDraft({
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

  function saveNewSet() {
    if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) {
      setAddSetError("Сначала укажите корректный 1ПМ в таблице Прилепина.");
      return;
    }

    const candidate = {
      exercise: "Bench Press" as const,
      weight: parseNumericInput(newSetDraft.weight),
      reps: parseNumericInput(newSetDraft.reps),
      sets: parseNumericInput(newSetDraft.sets),
    };

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
          <p>Максимально простой калькулятор одной тренировки: 1ПМ, вес, сеты и повторы.</p>
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
            <h2>INOL калькулятор (одна тренировка)</h2>
            <div className="sectionActions">
              <button type="button" className="btnPrimary" onClick={openAddSetModal}>
                + Добавить сет
              </button>
            </div>
          </div>
          <p className="inolOneRmNote">1ПМ для всех сетов берется из поля выше: {Number.isFinite(oneRepMax) ? format(oneRepMax) : "-"} кг.</p>

          {isAddSetModalOpen && (
            <div className="addSetOverlay" role="presentation" onClick={closeAddSetModal}>
              <div className="addSetModal" role="dialog" aria-modal="true" aria-label="Добавить сет" onClick={(e) => e.stopPropagation()} onKeyDown={handleModalKeyDown}>
                <div className="addSetModalHeader">
                  <div>
                    <h3>Добавить новый сет</h3>
                    <p>Введите только вес, сеты и повторы.</p>
                  </div>
                  <button type="button" className="popoverClose btnSecondary" onClick={closeAddSetModal} aria-label="Закрыть форму">
                    x
                  </button>
                </div>

                <div className="modalGrid">
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
              <h3>Одна тренировка</h3>
              <p>Суммарный INOL: {format(inolData.workoutInol)}</p>
              <p>{inolData.workoutInol > 0 ? interpretInol(inolData.workoutInol) : "добавьте хотя бы один сет"}</p>
            </article>

            <article>
              <h3>Формула</h3>
              <p>
                <code>INOL = total_reps / (100 - percent_1RM)</code>
              </p>
              <p>
                где <code>total_reps = sets * reps</code>.
              </p>
            </article>
          </div>
        </section>

        <section className="panel">
          <h2>Шкала INOL (ориентир)</h2>
          <div className="guideNow">
            <p>
              За тренировку: <strong>{format(inolData.workoutInol)}</strong>
            </p>
          </div>

          <div className="guideGrid">
            <article>
              <h3>Норма за тренировку</h3>
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
          </div>
        </section>

        <footer className="authorNote">Создал Артем Демидов</footer>
      </main>
    </div>
  );
}
