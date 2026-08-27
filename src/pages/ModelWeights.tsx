import { useData } from '../hooks/useData';
import { createDefaultSimulationConfig } from '../types/index.ts';
import type { SimulationConfig } from '../types/index.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

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

export default function ModelWeights() {
  const { simulationConfig, setSimulationConfig } = useData();
  const { t } = useI18n();
  const defaults = createDefaultSimulationConfig();

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
