import { useState, useCallback, useMemo } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName, pickTeamShort, slugify } from '../utils/helpers';
import type { ForecastAssumption } from '../types/index.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { SectionTabs } from '../components/SectionTabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function WhatIfLab() {
  const {
    league,
    teams,
    matches,
    simulation,
    scenarios,
    activeScenario,
    activeScenarioState,
    compareScenario,
    compareScenarioState,
    setCompareScenario,
    simulationConfig,
    createNewScenario,
    setActiveScenario,
    addScenarioOverride,
    removeScenarioOverride,
    setSimulationConfig,
    runSimulation,
  } = useData();
  const { t, lang } = useI18n();

  const [scenarioName, setScenarioName] = useState('');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [actionModalMatchId, setActionModalMatchId] = useState<string | null>(null);

  // Future matches for target team
  const targetFutureMatches = useMemo(() =>
    matches
      .filter(
        (m) =>
          m.status === 'scheduled' &&
          (m.homeTeamId === league.targetTeamId || m.awayTeamId === league.targetTeamId)
      )
      .sort((a, b) => a.round - b.round),
    [matches, league.targetTeamId]
  );

  // All future matches (filtered by round if selected)
  const allFutureMatches = useMemo(() => {
    let filtered = matches
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => a.round - b.round);
    if (selectedRound !== null) {
      filtered = filtered.filter((m) => m.round === selectedRound);
    }
    return filtered;
  }, [matches, selectedRound]);

  const rounds = useMemo(() => {
    const roundSet = new Set(matches.filter((m) => m.status === 'scheduled').map((m) => m.round));
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [matches]);

  const handleCreateScenario = useCallback(() => {
    if (!scenarioName.trim()) return;
    const s = createNewScenario(scenarioName.trim(), `Custom scenario: ${scenarioName}`);
    setScenarioName('');
    return s;
  }, [scenarioName, createNewScenario]);

  const handleQuickOverride = useCallback(
    (matchId: string, result: 'home' | 'draw' | 'away') => {
      if (!activeScenario) {
        // Auto-create a scenario
        const s = createNewScenario('Quick Scenario', 'Quick override scenario');
        const match = matches.find((m) => m.id === matchId);
        if (!match) return;

        let homeScore: number, awayScore: number;
        if (result === 'home') {
          homeScore = 2;
          awayScore = 0;
        } else if (result === 'draw') {
          homeScore = 1;
          awayScore = 1;
        } else {
          homeScore = 0;
          awayScore = 2;
        }
        addScenarioOverride(s.id, matchId, homeScore, awayScore);
        return;
      }

      const match = matches.find((m) => m.id === matchId);
      if (!match) return;

      let homeScore: number, awayScore: number;
      if (result === 'home') {
        homeScore = 2;
        awayScore = 0;
      } else if (result === 'draw') {
        homeScore = 1;
        awayScore = 1;
      } else {
        homeScore = 0;
        awayScore = 2;
      }
      addScenarioOverride(activeScenario.id, matchId, homeScore, awayScore);
    },
    [activeScenario, matches, createNewScenario, addScenarioOverride]
  );

  const handleScoreSubmit = useCallback(
    (matchId: string) => {
      const input = scoreInputs[matchId];
      if (!input) return;

      const home = parseInt(input.home, 10);
      const away = parseInt(input.away, 10);
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) return;

      if (!activeScenario) {
        const s = createNewScenario('Score Scenario', 'Custom score scenario');
        addScenarioOverride(s.id, matchId, home, away);
      } else {
        addScenarioOverride(activeScenario.id, matchId, home, away);
      }

      setScoreInputs((prev) => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
    },
    [scoreInputs, activeScenario, createNewScenario, addScenarioOverride]
  );

  // Compute state for active scenario
  const state = activeScenarioState;
  const compareState = compareScenarioState;

  // Position distribution for target team — overlays the compare scenario
  // (if one is picked) on the same chart as a second series.
  const targetPosDist = useMemo(() => {
    if (!state) return [];
    const positions = new Set<number>();
    Object.keys(state.finalPositionDistribution).forEach((p) => positions.add(Number(p)));
    if (compareState) {
      Object.keys(compareState.finalPositionDistribution).forEach((p) => positions.add(Number(p)));
    }
    return Array.from(positions)
      .sort((a, b) => a - b)
      .map((pos) => ({
        position: `Pos ${pos}`,
        probability: Math.round((state.finalPositionDistribution[pos] ?? 0) * 1000) / 10,
        compareProbability: compareState ? Math.round((compareState.finalPositionDistribution[pos] ?? 0) * 1000) / 10 : undefined,
      }))
      .filter((d) => d.probability > 0.5 || (d.compareProbability ?? 0) > 0.5);
  }, [state, compareState]);

  // Title probs comparison
  const titleComparison = useMemo(() => {
    if (!simulation || !state) return [];

    return teams
      .map((t) => {
        const baseProb = simulation.results.find((r) => r.teamId === t.id)?.titleProbability ?? 0;
        const scenarioProb = state.titleProbabilities[t.id] ?? 0;
        const compareProb = compareState?.titleProbabilities[t.id];
        return {
          name: pickTeamShort(t, lang),
          base: Math.round(baseProb * 1000) / 10,
          scenario: Math.round(scenarioProb * 1000) / 10,
          compare: compareProb !== undefined ? Math.round(compareProb * 1000) / 10 : undefined,
          diff: Math.round((scenarioProb - baseProb) * 1000) / 10,
          isTarget: t.id === league.targetTeamId,
        };
      })
      .filter((d) => d.base > 0.5 || d.scenario > 0.5 || (d.compare ?? 0) > 0.5)
      .sort((a, b) => b.scenario - a.scenario);
  }, [simulation, state, compareState, teams, league.targetTeamId, lang]);

  return (
    <div className="page">
      <h2>{t('WHAT-IF LAB')}</h2>

      <SectionTabs
        className="whatif-layout"
        sections={[
          { id: 'controls', label: t('CONTROLS'), content: (
        <div className="whatif-left">
          <div className="panel">
            <h3>{t('SCENARIOS')}</h3>
            <div className="scenario-create">
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder={t('New scenario name...')}
                className="input-field"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateScenario()}
              />
              <button className="btn btn-primary" onClick={handleCreateScenario}>
                {t('CREATE')}
              </button>
            </div>
            <div className="scenario-list">
              <div
                className={`scenario-item ${!activeScenario ? 'active' : ''}`}
                onClick={() => setActiveScenario(null)}
              >
                <span className="scenario-name">📊 {t('BASELINE')}</span>
                <span className="scenario-badge">{t('reality')}</span>
              </div>
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  className={`scenario-item ${activeScenario?.id === s.id ? 'active' : ''}`}
                  onClick={() => setActiveScenario(s.id)}
                >
                  <span className="scenario-name">🔮 {s.name}</span>
                  <span className="scenario-badge">{s.overrides.length} {t('overrides')}</span>
                </div>
              ))}
            </div>
            <div className="config-group" style={{ marginTop: 8 }}>
              <label>{t('Compare With')}</label>
              <select
                className="select-field"
                value={compareScenario?.id ?? ''}
                onChange={(e) => setCompareScenario(e.target.value || null)}
              >
                <option value="">{t('None')}</option>
                {scenarios
                  .filter((s) => s.id !== activeScenario?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Quick Override Panel */}
          <div className="panel">
            <h3>{t('QUICK OVERRIDES')}</h3>
            <div className="scenario-instructions">
              {t('Click W/D/L to set result. Click a score to type exact.')}
            </div>
            {targetFutureMatches.map((m) => {
              const isHome = m.homeTeamId === league.targetTeamId;
              const opponent = isHome ? m.awayTeamId : m.homeTeamId;
              const isOverridden = activeScenario?.overrides.some((o) => o.matchId === m.id);

              return (
                <div key={m.id} className={`match-override-row ${isOverridden ? 'overridden' : ''}`}>
                  <span className="override-round">R{m.round}</span>
                  <span className="override-match">
                    {isHome ? t('H') : t('A')} vs {getTeamName(teams, opponent, lang)}
                  </span>
                  <div className="override-buttons">
                    <button
                      className="btn btn-sm btn-win"
                      onClick={() => handleQuickOverride(m.id, 'home')}
                    >
                      {isHome ? 'W' : 'L'}
                    </button>
                    <button
                      className="btn btn-sm btn-draw"
                      onClick={() => handleQuickOverride(m.id, 'draw')}
                    >
                      D
                    </button>
                    <button
                      className="btn btn-sm btn-loss"
                      onClick={() => handleQuickOverride(m.id, 'away')}
                    >
                      {isHome ? 'L' : 'W'}
                    </button>
                  </div>
                  <div className="score-input-group">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={scoreInputs[m.id]?.home ?? ''}
                      onChange={(e) =>
                        setScoreInputs((prev) => ({
                          ...prev,
                          [m.id]: { ...prev[m.id], home: e.target.value },
                        }))
                      }
                      className="score-input"
                      placeholder="H"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={scoreInputs[m.id]?.away ?? ''}
                      onChange={(e) =>
                        setScoreInputs((prev) => ({
                          ...prev,
                          [m.id]: { ...prev[m.id], away: e.target.value },
                        }))
                      }
                      className="score-input"
                      placeholder="A"
                    />
                    <button
                      className="btn btn-sm btn-set"
                      onClick={() => handleScoreSubmit(m.id)}
                    >
                      {t('SET')}
                    </button>
                  </div>
                  {isOverridden && (
                    <button
                      className="btn btn-sm btn-remove"
                      onClick={() =>
                        activeScenario && removeScenarioOverride(activeScenario.id, m.id)
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* All Future Matches (filtered) */}
          <div className="panel">
            <h3>{t('ALL FUTURE MATCHES')}</h3>
            <div className="round-filter desktop-only-action">
              <button
                className={`btn btn-sm ${selectedRound === null ? 'active' : ''}`}
                onClick={() => setSelectedRound(null)}
              >
                {t('ALL')}
              </button>
              {rounds.map((r) => (
                <button
                  key={r}
                  className={`btn btn-sm ${selectedRound === r ? 'active' : ''}`}
                  onClick={() => setSelectedRound(r)}
                >
                  R{r}
                </button>
              ))}
            </div>
            <select
              className="select-field mobile-only-action mobile-round-select"
              value={selectedRound ?? ''}
              onChange={(e) => setSelectedRound(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">{t('ALL')}</option>
              {rounds.map((r) => (
                <option key={r} value={r}>R{r}</option>
              ))}
            </select>
            <table className="dense-table">
              <thead>
                <tr>
                  <th>{t('R')}</th>
                  <th>{t('Match')}</th>
                  <th>{t('Action')}</th>
                  <th className="mobile-hide-cell">{t('Exact Score')}</th>
                </tr>
              </thead>
              <tbody>
                {allFutureMatches.slice(0, 50).map((m) => {
                  const isOverridden = activeScenario?.overrides.some((o) => o.matchId === m.id);
                  const override = activeScenario?.overrides.find((o) => o.matchId === m.id);
                  return (
                    <tr key={m.id} className={isOverridden ? 'overridden' : ''}>
                      <td>{m.round}</td>
                      <td>
                        {getTeamName(teams, m.homeTeamId, lang)} vs {getTeamName(teams, m.awayTeamId, lang)}
                        {override && (
                          <span className="score-cell"> ({override.homeScore}-{override.awayScore})</span>
                        )}
                      </td>
                      <td>
                        <div className="override-buttons compact desktop-only-action">
                          <button
                            className="btn btn-xs"
                            onClick={() => handleQuickOverride(m.id, 'home')}
                          >
                            H
                          </button>
                          <button
                            className="btn btn-xs"
                            onClick={() => handleQuickOverride(m.id, 'draw')}
                          >
                            D
                          </button>
                          <button
                            className="btn btn-xs"
                            onClick={() => handleQuickOverride(m.id, 'away')}
                          >
                            A
                          </button>
                          {isOverridden && (
                            <button
                              className="btn btn-xs btn-remove"
                              onClick={() =>
                                activeScenario && removeScenarioOverride(activeScenario.id, m.id)
                              }
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <button
                          className="btn btn-sm mobile-only-action"
                          onClick={() => setActionModalMatchId(m.id)}
                        >
                          {t('EDIT')}
                        </button>
                      </td>
                      <td className="mobile-hide-cell">
                        <div className="score-input-group">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={scoreInputs[m.id]?.home ?? ''}
                            onChange={(e) =>
                              setScoreInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...prev[m.id], home: e.target.value },
                              }))
                            }
                            className="score-input"
                            placeholder="H"
                          />
                          <span>-</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={scoreInputs[m.id]?.away ?? ''}
                            onChange={(e) =>
                              setScoreInputs((prev) => ({
                                ...prev,
                                [m.id]: { ...prev[m.id], away: e.target.value },
                              }))
                            }
                            className="score-input"
                            placeholder="A"
                          />
                          <button className="btn btn-xs btn-set" onClick={() => handleScoreSubmit(m.id)}>{t('SET')}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {actionModalMatchId && (() => {
            const modalMatch = matches.find((mm) => mm.id === actionModalMatchId);
            if (!modalMatch) return null;
            const modalOverridden = activeScenario?.overrides.some((o) => o.matchId === modalMatch.id);
            return (
              <div className="modal-overlay" onClick={() => setActionModalMatchId(null)}>
                <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                  <h3>{getTeamName(teams, modalMatch.homeTeamId, lang)} vs {getTeamName(teams, modalMatch.awayTeamId, lang)}</h3>
                  <div className="override-buttons" style={{ marginTop: 10, marginBottom: 10 }}>
                    <button className="btn btn-win" onClick={() => { handleQuickOverride(modalMatch.id, 'home'); setActionModalMatchId(null); }}>H</button>
                    <button className="btn btn-draw" onClick={() => { handleQuickOverride(modalMatch.id, 'draw'); setActionModalMatchId(null); }}>D</button>
                    <button className="btn btn-loss" onClick={() => { handleQuickOverride(modalMatch.id, 'away'); setActionModalMatchId(null); }}>A</button>
                  </div>
                  <div className="score-input-group" style={{ marginBottom: 10 }}>
                    <input
                      type="number" min="0" max="10"
                      value={scoreInputs[modalMatch.id]?.home ?? ''}
                      onChange={(e) => setScoreInputs((prev) => ({ ...prev, [modalMatch.id]: { ...prev[modalMatch.id], home: e.target.value } }))}
                      className="score-input" placeholder="H"
                    />
                    <span>-</span>
                    <input
                      type="number" min="0" max="10"
                      value={scoreInputs[modalMatch.id]?.away ?? ''}
                      onChange={(e) => setScoreInputs((prev) => ({ ...prev, [modalMatch.id]: { ...prev[modalMatch.id], away: e.target.value } }))}
                      className="score-input" placeholder="A"
                    />
                    <button className="btn btn-set" onClick={() => { handleScoreSubmit(modalMatch.id); setActionModalMatchId(null); }}>{t('SET')}</button>
                  </div>
                  <div className="override-buttons" style={{ justifyContent: 'flex-end' }}>
                    {modalOverridden && (
                      <button
                        className="btn btn-remove"
                        onClick={() => { if (activeScenario) removeScenarioOverride(activeScenario.id, modalMatch.id); setActionModalMatchId(null); }}
                      >
                        {t('REMOVE')}
                      </button>
                    )}
                    <button className="btn" onClick={() => setActionModalMatchId(null)}>{t('CLOSE')}</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
          ) },
          { id: 'results', label: t('RESULTS'), content: (
        <div className="whatif-center">
          {/* Active Overrides Summary */}
          {activeScenario && activeScenario.overrides.length > 0 && (
            <div className="panel">
              <h3>{t('ACTIVE OVERRIDES')} ({activeScenario.overrides.length})</h3>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>{t('Match')}</th>
                    <th>{t('Result')}</th>
                    <th>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.overrides.map((o) => {
                    const match = matches.find((m) => m.id === o.matchId);
                    if (!match) return null;
                    return (
                      <tr key={o.matchId}>
                        <td>
                          R{match.round} {getTeamName(teams, match.homeTeamId, lang)} vs{' '}
                          {getTeamName(teams, match.awayTeamId, lang)}
                        </td>
                        <td className="score-cell">
                          {o.homeScore} - {o.awayScore}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-remove"
                            onClick={() => removeScenarioOverride(activeScenario.id, o.matchId)}
                          >
                            {t('REMOVE')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Scenario Standings */}
          {state && (
            <div className="panel">
              <h3>{t('SCENARIO STANDINGS')}</h3>
              <table className="dense-table standings-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('Team')}</th>
                    <th>{t('P')}</th>
                    <th>{t('W')}</th>
                    <th>{t('D')}</th>
                    <th>{t('L')}</th>
                    <th>{t('GF')}</th>
                    <th>{t('GA')}</th>
                    <th>{t('GD')}</th>
                    <th>{t('Pts')}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.standings.map((s) => {
                    const isTarget = s.teamId === league.targetTeamId;
                    return (
                      <tr key={s.teamId} className={isTarget ? 'target-row' : ''}>
                        <td>{s.position}</td>
                        <td>{getTeamName(teams, s.teamId, lang)}</td>
                        <td>{s.matchesPlayed}</td>
                        <td>{s.wins}</td>
                        <td>{s.draws}</td>
                        <td>{s.losses}</td>
                        <td>{s.goalsFor}</td>
                        <td>{s.goalsAgainst}</td>
                        <td className={s.goalDifference >= 0 ? 'positive' : 'negative'}>
                          {s.goalDifference > 0 ? '+' : ''}{s.goalDifference}
                        </td>
                        <td className="points-cell">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Position Distribution */}
          {state && targetPosDist.length > 0 && (
            <div className="panel chart-panel">
              <h3>{t('FINAL POSITION DISTRIBUTION')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={targetPosDist} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="position" tick={{ fontSize: 10, fill: '#aaa' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
                  <Bar dataKey="probability" fill="#e74c3c" name={activeScenario?.name ?? t('BASELINE')} />
                  {compareScenario && (
                    <Bar dataKey="compareProbability" fill="#3498db" name={compareScenario.name} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Title Probability Comparison */}
          {titleComparison.length > 0 && (
            <div className="panel">
              <h3>{t('TITLE PROBABILITY COMPARISON')}</h3>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>{t('Team')}</th>
                    <th>{t('Baseline')}</th>
                    <th>{t('Scenario')}</th>
                    {compareScenario && <th>{compareScenario.name}</th>}
                    <th>{t('Change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {titleComparison.map((d) => (
                    <tr key={d.name} className={d.isTarget ? 'target-row' : ''}>
                      <td>{d.name}</td>
                      <td>{d.base}%</td>
                      <td className={d.isTarget ? 'accent' : ''}>{d.scenario}%</td>
                      {compareScenario && <td>{d.compare ?? 0}%</td>}
                      <td className={d.diff > 0 ? 'positive' : d.diff < 0 ? 'negative' : ''}>
                        {d.diff > 0 ? '+' : ''}{d.diff}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          ) },
          { id: 'analysis', label: t('ANALYSIS'), content: (
        <div className="whatif-right">
          {/* Title Probability */}
          {state && (
            <div className="panel">
              <h3>{t('TITLE PROBABILITY')}</h3>
              <div className="stat-row">
                <span className="stat-label">{t('Target Team')}</span>
                <span className="stat-value big accent">
                  {Math.round(state.targetTeamTitleProb * 1000) / 10}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('Status')}</span>
                <span className="stat-value">{t(state.titleStatus.label)}</span>
              </div>
            </div>
          )}

          {/* Must-Win Analysis */}
          {state && state.mustWinAnalysis.length > 0 && (
            <div className="panel">
              <h3>{t('MUST-WIN ANALYSIS')}</h3>
              {state.mustWinAnalysis.map((mw) => {
                const match = matches.find((m) => m.id === mw.matchId);
                if (!match) return null;
                return (
                  <div key={mw.matchId} className={`mustwin-item mustwin-${mw.classification.toLowerCase().replace('_', '-')}`}>
                    <div className="mustwin-header">
                      <span>R{mw.round}</span>
                      <span className={`badge badge-${mw.classification.toLowerCase().replace('_', '-')}`}>
                        {t(mw.classification)}
                      </span>
                    </div>
                    <div className="mustwin-match">
                      {getTeamName(teams, mw.homeTeamId, lang)} vs {getTeamName(teams, mw.awayTeamId, lang)}
                    </div>
                    {mw.reasons.map((r, i) => (
                      <div key={i} className="mustwin-reason">{r}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Path Analysis */}
          {state && state.pathAnalysis && (
            <div className="panel">
              <h3>{t('EASIEST PATH')}</h3>
              {state.pathAnalysis.easiestPath.map((step) => (
                <div key={step.matchId} className="path-step">
                  <span className="path-round">R{step.round}</span>
                  <span className="path-opponent">
                    {step.isHome ? t('H') : t('A')} vs {step.opponent}
                  </span>
                  <span className={`path-requirement req-${slugify(step.requirement)}`}>
                    {t(step.requirement)}
                  </span>
                </div>
              ))}
              <div className="path-summary">
                <div className="stat-row">
                  <span className="stat-label">{t('Required Wins')}</span>
                  <span className="stat-value">{state.pathAnalysis.requiredWins}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Required Points')}</span>
                  <span className="stat-value">{state.pathAnalysis.requiredPoints}</span>
                </div>
              </div>
            </div>
          )}

          {/* Control Index */}
          {state && state.controlIndex && (
            <div className="panel">
              <h3>{t('TITLE CONTROL')}</h3>
              <div className="control-meter">
                <div className="meter-bar">
                  <div
                    className="meter-fill own"
                    style={{ width: `${state.controlIndex.ownResults}%` }}
                  />
                  <div
                    className="meter-fill rival"
                    style={{ width: `${state.controlIndex.rivalDependence}%` }}
                  />
                </div>
                <div className="meter-labels">
                  <span>{t('OWN')}: {state.controlIndex.ownResults}%</span>
                  <span>{t('RIVAL')}: {state.controlIndex.rivalDependence}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Simulation Config */}
          <div className="panel">
            <h3>{t('SIMULATION CONFIG')}</h3>
            <div className="config-group">
              <label>{t('Assumption')}</label>
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
            <button className="btn btn-primary" onClick={runSimulation}>
              {t('RE-RUN SIMULATION')}
            </button>
          </div>
        </div>
          ) },
        ]}
      />
    </div>
  );
}
