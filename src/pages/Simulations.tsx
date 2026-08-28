import { useState } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import type { ForecastAssumption } from '../types/index.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { SectionTabs } from '../components/SectionTabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from 'recharts';

type ChartType = 'bar' | 'line';
type SortKey = 'title' | 'top2' | 'top4' | 'name';
type SeriesKey = 'title' | 'top2' | 'top4';

export default function Simulations() {
  const { league, teams, simulation, simulationConfig, setSimulationConfig, runSimulation, isLoading } = useData();
  const [simCount, setSimCount] = useState(simulationConfig.count);
  const [showTravelFatigueModal, setShowTravelFatigueModal] = useState(false);
  const { t, lang } = useI18n();

  // Chart display controls: type, sort order, which series are shown, value labels.
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({ title: true, top2: true, top4: true });
  const [showLabels, setShowLabels] = useState(false);
  const toggleSeries = (key: SeriesKey) => setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!simulation) {
    return <div className="page"><h2>{t('SIMULATIONS')}</h2><p>{t('Loading simulation data...')}</p></div>;
  }

  const handleReRun = () => {
    setSimulationConfig({ ...simulationConfig, count: simCount });
    setTimeout(() => runSimulation(), 50);
  };

  // Build data for team comparison chart
  const teamChartData = [...simulation.results]
    .sort((a, b) => b.titleProbability - a.titleProbability)
    .slice(0, 8)
    .map((r) => ({
      name: getTeamName(teams, r.teamId, lang),
      title: Math.round(r.titleProbability * 1000) / 10,
      top2: Math.round(r.top2Probability * 1000) / 10,
      top4: Math.round(r.top4Probability * 1000) / 10,
      isTarget: r.teamId === league.targetTeamId,
    }))
    .sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : b[sortKey] - a[sortKey]));

  const seriesColors: Record<SeriesKey, string> = { title: '#e74c3c', top2: '#3498db', top4: '#2ecc71' };
  const seriesLabels: Record<SeriesKey, string> = { title: t('Title %'), top2: t('Top 2 %'), top4: t('Top 4 %') };

  return (
    <div className="page">
      <h2>{t('SIMULATIONS')}</h2>

      <SectionTabs
        sections={[
          { id: 'config', label: t('CONFIG'), content: (
      <div className="panel full-width">
        <h3>{t('SIMULATION CONFIGURATION')}</h3>
        <div className="sim-config">
          <div className="config-group">
            <label>{t('Simulation Count')}</label>
            <select
              value={simCount}
              onChange={(e) => setSimCount(parseInt(e.target.value))}
              className="select-field"
            >
              <option value={1000}>1,000</option>
              <option value={10000}>10,000</option>
              <option value={50000}>50,000</option>
              <option value={100000}>100,000</option>
            </select>
          </div>
          <div className="config-group">
            <label>{t('Assumptions')}</label>
            <select
              value={simulationConfig.assumptions}
              onChange={(e) =>
                setSimulationConfig({
                  ...simulationConfig,
                  assumptions: e.target.value as ForecastAssumption,
                })
              }
              className="select-field"
            >
              <option value="status_quo">{t('Status Quo')}</option>
              <option value="recent_form">{t('Recent Form')}</option>
              <option value="long_term">{t('Long Term')}</option>
              <option value="mean_reversion">{t('Mean Reversion')}</option>
              <option value="hot_form">{t('Hot Form')}</option>
              <option value="cold_form">{t('Cold Form')}</option>
            </select>
          </div>
          <div className="config-group">
            <label>{t('Form Weight')}: {simulationConfig.formWeighting}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={simulationConfig.formWeighting}
              onChange={(e) =>
                setSimulationConfig({
                  ...simulationConfig,
                  formWeighting: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div className="config-group">
            <label>{t('Home/Away Tendency')}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={simulationConfig.homeAwayAdjustment}
                onChange={(e) =>
                  setSimulationConfig({
                    ...simulationConfig,
                    homeAwayAdjustment: e.target.checked,
                  })
                }
              />
              {simulationConfig.homeAwayAdjustment ? t('Reflected (home advantage + per-team home/away split)') : t('Off (every match treated as neutral venue)')}
            </label>
          </div>
          <div className="config-group">
            <label>{t('Second Leg (Return Fixtures)')}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={simulationConfig.includeSecondLeg}
                onChange={(e) =>
                  setSimulationConfig({
                    ...simulationConfig,
                    includeSecondLeg: e.target.checked,
                  })
                }
              />
              {simulationConfig.includeSecondLeg
                ? t('Included — projects unpublished return-leg matches (round not yet fixtured)')
                : t('Off — season ends at the last published round')}
            </label>
          </div>
          <div className="config-group">
            <label>{t('Travel Fatigue')}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={simulationConfig.travelFatigue}
                onChange={(e) => {
                  if (e.target.checked) {
                    setShowTravelFatigueModal(true);
                  } else {
                    setSimulationConfig({ ...simulationConfig, travelFatigue: false });
                  }
                }}
              />
              {simulationConfig.travelFatigue
                ? t('Reflected — away team\'s expected goals dip slightly the further they travel from their own ground')
                : t('Off — travel distance has no effect')}
            </label>
          </div>
          <button className="btn btn-primary" onClick={handleReRun} disabled={isLoading}>
            {isLoading ? t('RUNNING...') : t('RUN SIMULATION')}
          </button>
        </div>
      </div>
          ) },
          { id: 'chart', label: t('CHART'), content: (<>
      {/* Results Summary */}
      <div className="sim-meta">
        <span>{t('Count')}: {simulation.config.count.toLocaleString()}</span>
        <span>{t('Assumptions')}: {simulation.config.assumptions.toUpperCase()}</span>
        <span>{t('Seed')}: {simulation.config.seed}</span>
        <span>{t('Generated')}: {new Date(simulation.generatedAt).toLocaleString()}</span>
      </div>

      {/* Chart */}
      <div className="panel full-width chart-panel">
        <h3>{t('TITLE PROBABILITY COMPARISON')}</h3>
        <div className="sim-config" style={{ marginBottom: 8 }}>
          <div className="config-group">
            <label>{t('Chart Type')}</label>
            <select className="select-field" value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)}>
              <option value="bar">{t('Bar')}</option>
              <option value="line">{t('Line')}</option>
            </select>
          </div>
          <div className="config-group">
            <label>{t('Sort By')}</label>
            <select className="select-field" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="title">{t('Title %')}</option>
              <option value="top2">{t('Top 2 %')}</option>
              <option value="top4">{t('Top 4 %')}</option>
              <option value="name">{t('Team Name')}</option>
            </select>
          </div>
          <div className="config-group">
            <label>{t('Series')}</label>
            <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              {(['title', 'top2', 'top4'] as SeriesKey[]).map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input type="checkbox" checked={visibleSeries[key]} onChange={() => toggleSeries(key)} />
                  {seriesLabels[key]}
                </label>
              ))}
            </div>
          </div>
          <div className="config-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              {t('Show Value Labels')}
            </label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'bar' ? (
            <BarChart data={teamChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#aaa' }} />
              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(['title', 'top2', 'top4'] as SeriesKey[]).filter((k) => visibleSeries[k]).map((key) => (
                <Bar key={key} dataKey={key} fill={seriesColors[key]} name={seriesLabels[key]}>
                  {showLabels && <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: '#aaa' }} />}
                </Bar>
              ))}
            </BarChart>
          ) : (
            <LineChart data={teamChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#aaa' }} />
              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(['title', 'top2', 'top4'] as SeriesKey[]).filter((k) => visibleSeries[k]).map((key) => (
                <Line key={key} type="monotone" dataKey={key} stroke={seriesColors[key]} name={seriesLabels[key]} dot={{ r: 3 }}>
                  {showLabels && <LabelList dataKey={key} position="top" style={{ fontSize: 9, fill: '#aaa' }} />}
                </Line>
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      </>) },
          { id: 'results', label: t('RESULTS'), content: (
      <div className="panel full-width">
        <h3>{t('FULL SIMULATION RESULTS')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('Team')}</th>
              <th>{t('Title %')}</th>
              <th>{t('Top 2 %')}</th>
              <th>{t('Top 4 %')}</th>
              <th>{t('Avg Pos')}</th>
              <th>{t('Exp Pts')}</th>
              <th>{t('Exp GD')}</th>
              <th>{t('Min Pos')}</th>
              <th>{t('Max Pos')}</th>
            </tr>
          </thead>
          <tbody>
            {[...simulation.results]
              .sort((a, b) => b.titleProbability - a.titleProbability)
              .map((r) => {
                const isTarget = r.teamId === league.targetTeamId;
                return (
                  <tr key={r.teamId} className={isTarget ? 'target-row' : ''}>
                    <td>{getTeamName(teams, r.teamId, lang)}</td>
                    <td className={r.titleProbability > 0.1 ? 'highlight' : ''}>
                      {(r.titleProbability * 100).toFixed(1)}%
                    </td>
                    <td>{(r.top2Probability * 100).toFixed(1)}%</td>
                    <td>{(r.top4Probability * 100).toFixed(1)}%</td>
                    <td>{r.avgFinishingPosition.toFixed(1)}</td>
                    <td>{r.expectedFinalPoints}</td>
                    <td>{r.expectedFinalGD > 0 ? '+' : ''}{r.expectedFinalGD}</td>
                    <td>{r.minPosition}</td>
                    <td>{r.maxPosition}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
          ) },
          { id: 'matrix', label: t('MATRIX'), content: (
      <div className="panel full-width">
        <h3>{t('POSITION PROBABILITY MATRIX')}</h3>
        <div className="matrix-scroll">
          <table className="dense-table matrix-table">
            <thead>
              <tr>
                <th>{t('Team')}</th>
                {Array.from({ length: teams.length }, (_, i) => (
                  <th key={i}>P{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...simulation.results]
                .sort((a, b) => {
                  const a1 = a.positionProbabilities[1] ?? 0;
                  const b1 = b.positionProbabilities[1] ?? 0;
                  return b1 - a1;
                })
                .map((r) => {
                  const isTarget = r.teamId === league.targetTeamId;
                  return (
                    <tr key={r.teamId} className={isTarget ? 'target-row' : ''}>
                      <td>{getTeamName(teams, r.teamId, lang)}</td>
                      {Array.from({ length: teams.length }, (_, i) => {
                        const prob = r.positionProbabilities[i + 1] ?? 0;
                        const pct = Math.round(prob * 100);
                        return (
                          <td
                            key={i}
                            className="matrix-cell"
                            style={{
                              backgroundColor: prob > 0.01
                                ? `rgba(231, 76, 60, ${Math.min(1, prob * 3)})`
                                : undefined,
                            }}
                          >
                            {pct > 0 ? `${pct}%` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
          ) },
        ]}
      />

      {showTravelFatigueModal && (
        <div className="modal-overlay" onClick={() => setShowTravelFatigueModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--red)' }}>⚠ {t('EXPERIMENTAL FEATURE')}</h3>
            <p className="path-description">
              {t('Travel Fatigue is a rough, untested model: it only uses straight-line distance between grounds (not travel time or road conditions), ignores rest days between away trips, and its penalty size (up to 10%) is a guessed constant, not fitted to real data. Turn it on knowing the numbers it changes are a guess layered on top of an already-uncalibrated model.')}
            </p>
            <div className="override-buttons" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setShowTravelFatigueModal(false)}>{t('CANCEL')}</button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setSimulationConfig({ ...simulationConfig, travelFatigue: true });
                  setShowTravelFatigueModal(false);
                }}
              >
                {t('ENABLE ANYWAY')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
