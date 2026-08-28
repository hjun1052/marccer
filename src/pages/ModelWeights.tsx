import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../hooks/useData';
import { createDefaultSimulationConfig } from '../types/index.ts';
import type { SimulationConfig } from '../types/index.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { runBacktest } from '../engine/backtest.ts';
import { randomWeights, scoreWeights, mulberry32, MIN_BACKTEST_MATCHES, TUNABLE_RANGES } from '../engine/autotune.ts';
import type { TunableWeightKey } from '../engine/autotune.ts';

type WeightKey =
  | 'kFactor' | 'homeAdvantage' | 'attackWeight' | 'defenseWeight' | 'venueWeight'
  | 'regressionPriorGames' | 'dixonColesRho' | 'travelFatigueReferenceKm' | 'travelFatigueMaxPenalty';

interface WeightSpec {
  key: WeightKey;
  min: number;
  max: number;
  step: number;
}

const SPECS: WeightSpec[] = [
  { key: 'kFactor', min: 8, max: 64, step: 4 },
  { key: 'homeAdvantage', min: 0, max: 120, step: 5 },
  { key: 'attackWeight', min: 0, max: 1, step: 0.05 },
  { key: 'defenseWeight', min: 0, max: 1, step: 0.05 },
  { key: 'venueWeight', min: 0, max: 1, step: 0.05 },
  { key: 'regressionPriorGames', min: 0, max: 20, step: 1 },
  { key: 'dixonColesRho', min: -0.3, max: 0.1, step: 0.01 },
  { key: 'travelFatigueReferenceKm', min: 50, max: 500, step: 10 },
  { key: 'travelFatigueMaxPenalty', min: 0, max: 0.3, step: 0.01 },
];

const AUTOTUNE_START_ROUND = 3;
const AUTOTUNE_TOTAL_TRIALS = 150;
const AUTOTUNE_BATCH_SIZE = 5;
const AUTOTUNE_BATCH_DELAY_MS = 25;

interface TuneState {
  running: boolean;
  trial: number;
  total: number;
  baselineScore: number;
  bestScore: number;
  bestConfig: SimulationConfig;
  done: boolean;
}

export default function ModelWeights() {
  const { league, teams, matches, simulationConfig, setSimulationConfig } = useData();
  const { t } = useI18n();
  const defaults = createDefaultSimulationConfig();

  // --- Auto-tune (experimental) ---
  const backtestMatchCount = useMemo(
    () => runBacktest(league, teams, matches, simulationConfig, AUTOTUNE_START_ROUND).overall.matches,
    [league, teams, matches, simulationConfig]
  );
  const hasEnoughData = backtestMatchCount >= MIN_BACKTEST_MATCHES;

  const [showAutotuneModal, setShowAutotuneModal] = useState(false);
  const [tune, setTune] = useState<TuneState | null>(null);
  const cancelRef = useRef(false);

  // Stop the trial loop if the user navigates away mid-run.
  useEffect(() => () => { cancelRef.current = true; }, []);

  const runAutotune = () => {
    cancelRef.current = false;
    const rng = mulberry32(Date.now() | 0);
    const baselineScore = scoreWeights(league, teams, matches, simulationConfig, AUTOTUNE_START_ROUND);
    setTune({
      running: true, trial: 0, total: AUTOTUNE_TOTAL_TRIALS,
      baselineScore, bestScore: baselineScore, bestConfig: simulationConfig, done: false,
    });

    const step = (trial: number, bestScore: number, bestConfig: SimulationConfig) => {
      if (cancelRef.current || trial >= AUTOTUNE_TOTAL_TRIALS) {
        setTune((prev) => prev && { ...prev, running: false, done: true, trial, bestScore, bestConfig });
        return;
      }
      let curBest = bestScore;
      let curBestConfig = bestConfig;
      const batchEnd = Math.min(trial + AUTOTUNE_BATCH_SIZE, AUTOTUNE_TOTAL_TRIALS);
      for (let i = trial; i < batchEnd; i++) {
        const candidate = randomWeights(simulationConfig, rng);
        const score = scoreWeights(league, teams, matches, candidate, AUTOTUNE_START_ROUND);
        if (score < curBest) {
          curBest = score;
          curBestConfig = candidate;
        }
      }
      setTune({
        running: true, trial: batchEnd, total: AUTOTUNE_TOTAL_TRIALS,
        baselineScore, bestScore: curBest, bestConfig: curBestConfig, done: false,
      });
      setTimeout(() => step(batchEnd, curBest, curBestConfig), AUTOTUNE_BATCH_DELAY_MS);
    };
    setTimeout(() => step(0, baselineScore, simulationConfig), AUTOTUNE_BATCH_DELAY_MS);
  };

  const stopAutotune = () => {
    cancelRef.current = true;
  };

  const applyAutotune = () => {
    if (!tune) return;
    setSimulationConfig(tune.bestConfig);
    setTune(null);
  };

  const discardAutotune = () => {
    cancelRef.current = true;
    setTune(null);
  };

  const labels: Record<WeightKey, string> = {
    kFactor: t('K Factor (Elo learning rate)'),
    homeAdvantage: t('Home Advantage (rating points)'),
    attackWeight: t('Attack Weight'),
    defenseWeight: t('Defense Weight'),
    venueWeight: t('Home/Away Split Weight'),
    regressionPriorGames: t('Regression Prior Games'),
    dixonColesRho: t('Dixon-Coles Rho'),
    travelFatigueReferenceKm: t('Travel Fatigue Reference (km)'),
    travelFatigueMaxPenalty: t('Travel Fatigue Max Penalty'),
  };
  const descriptions: Record<WeightKey, string> = {
    kFactor: t('How fast the overall Elo rating reacts to a single result. Higher = more volatile, faster-reacting ratings.'),
    homeAdvantage: t('Elo rating-point bonus given to the home side before computing expected result.'),
    attackWeight: t('How fast attack rating reacts to goals scored, as a fraction of K Factor.'),
    defenseWeight: t('How fast defense rating reacts to goals conceded, as a fraction of K Factor.'),
    venueWeight: t('How fast the home-specific / away-specific rating reacts, as a fraction of K Factor.'),
    regressionPriorGames: t('"Prior games" of neutral evidence baked in — higher pulls new/small-sample ratings harder back toward the league average.'),
    dixonColesRho: t('Low-score correlation correction. Negative values (typical for football) make 0-0/1-1 a bit more likely and 1-0/0-1 a bit less likely than independent Poisson would predict.'),
    travelFatigueReferenceKm: t('Distance at which the travel fatigue effect (if enabled) reaches its maximum penalty.'),
    travelFatigueMaxPenalty: t('Maximum fraction the away side\'s expected goals are reduced by, at or beyond the reference distance.'),
  };

  const update = (key: WeightKey, value: number) => {
    setSimulationConfig({ ...simulationConfig, [key]: value } as SimulationConfig);
  };

  const resetAll = () => {
    setSimulationConfig({
      ...simulationConfig,
      kFactor: defaults.kFactor,
      homeAdvantage: defaults.homeAdvantage,
      attackWeight: defaults.attackWeight,
      defenseWeight: defaults.defenseWeight,
      venueWeight: defaults.venueWeight,
      regressionPriorGames: defaults.regressionPriorGames,
      dixonColesRho: defaults.dixonColesRho,
      travelFatigueReferenceKm: defaults.travelFatigueReferenceKm,
      travelFatigueMaxPenalty: defaults.travelFatigueMaxPenalty,
    });
  };

  const isModified = SPECS.some((s) => simulationConfig[s.key] !== defaults[s.key]);

  return (
    <div className="page">
      <h2>{t('MODEL WEIGHTS')}</h2>

      <div className="panel full-width" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}>⚠ {t('ADVANCED — UNVALIDATED')}</h3>
        <p className="path-description">
          {t('These are the raw constants the rating and prediction engine runs on. The defaults are reasonable literature-typical values, not fitted to this league\'s data (see the METHODOLOGY and BACKTEST tabs for why). Changing them changes every probability on this site — there is no guarantee a different value is more accurate, only different.')}
        </p>
        {isModified && (
          <button className="btn btn-sm btn-remove" onClick={resetAll} style={{ marginTop: 8 }}>
            {t('RESET ALL TO DEFAULT')}
          </button>
        )}
      </div>

      <div className="panel full-width" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}>⚠ {t('AUTO-TUNE (EXPERIMENTAL)')}</h3>
        <p className="path-description">
          {t('Randomly samples weight combinations and scores each with the same walk-forward backtest as the BACKTEST tab (lower Brier score = better), keeping the best one found. This is a blind random search, not a real optimizer — it can only be as good as the data it\'s tested against.')}
        </p>

        {!hasEnoughData ? (
          <div className="mathematical-note" style={{ color: 'var(--red)' }}>
            ⚠ {t('Not enough graded matches yet')} ({backtestMatchCount} / {MIN_BACKTEST_MATCHES}) — {t('auto-tune is disabled until more rounds are played. With this little data, "the best" weights found would just be overfit to noise.')}
          </div>
        ) : !tune ? (
          <button className="btn btn-sm btn-primary" onClick={() => setShowAutotuneModal(true)}>
            {t('START AUTO-TUNE')}
          </button>
        ) : (
          <>
            <div className="stat-row">
              <span className="stat-label">{t('Progress')}</span>
              <span className="stat-value">{tune.trial} / {tune.total}</span>
            </div>
            <div className="dependency-bar" style={{ marginBottom: 8 }}>
              <div className="dependency-fill" style={{ width: `${(tune.trial / tune.total) * 100}%` }} />
              <span>{Math.round((tune.trial / tune.total) * 100)}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{t('Current weights\' Brier score')}</span>
              <span className="stat-value">{tune.baselineScore.toFixed(4)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{t('Best found so far')}</span>
              <span className={`stat-value ${tune.bestScore < tune.baselineScore ? 'positive' : ''}`}>
                {tune.bestScore.toFixed(4)}
                {tune.bestScore < tune.baselineScore && ` (${t('better')})`}
              </span>
            </div>

            {tune.running ? (
              <button className="btn btn-sm btn-remove" onClick={stopAutotune}>{t('STOP')}</button>
            ) : (
              <>
                {tune.bestScore < tune.baselineScore ? (
                  <table className="dense-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr><th>{t('Weight')}</th><th>{t('Current')}</th><th>{t('Best found')}</th></tr>
                    </thead>
                    <tbody>
                      {TUNABLE_RANGES.map(({ key }) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{(simulationConfig[key as TunableWeightKey] as number).toFixed(3)}</td>
                          <td className="highlight">{(tune.bestConfig[key as TunableWeightKey] as number).toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="no-data">{t('No improvement found over the current weights in this run.')}</div>
                )}
                <div className="override-buttons" style={{ marginTop: 8 }}>
                  {tune.bestScore < tune.baselineScore && (
                    <button className="btn btn-sm btn-primary" onClick={applyAutotune}>{t('APPLY BEST FOUND')}</button>
                  )}
                  <button className="btn btn-sm" onClick={discardAutotune}>{t('DISCARD')}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showAutotuneModal && (
        <div className="modal-overlay" onClick={() => setShowAutotuneModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--red)' }}>⚠ {t('EXPERIMENTAL FEATURE')}</h3>
            <p className="path-description">
              {t('Auto-tune searches for weights that score better on the walk-forward backtest — but with only a few dozen graded matches, a lower Brier score here is not strong evidence of real accuracy, it can just mean the search got lucky against this small sample. Nothing changes until you explicitly apply a result.')}
            </p>
            <div className="override-buttons" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setShowAutotuneModal(false)}>{t('CANCEL')}</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => { setShowAutotuneModal(false); runAutotune(); }}
              >
                {t('RUN ANYWAY')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel full-width">
        <h3>{t('WEIGHTS')}</h3>
        {SPECS.map((spec) => {
          const value = simulationConfig[spec.key];
          const isDefault = value === defaults[spec.key];
          return (
            <div key={spec.key} className="config-group" style={{ marginBottom: 14 }}>
              <label>
                {labels[spec.key]}: <strong>{value}</strong>
                {!isDefault && <span className="stat-value accent" style={{ marginLeft: 6, fontSize: 10 }}>({t('default')} {defaults[spec.key]})</span>}
              </label>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(e) => update(spec.key, parseFloat(e.target.value))}
              />
              <div className="status-desc">{descriptions[spec.key]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
