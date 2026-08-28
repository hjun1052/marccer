import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import { analyzeAllMatchRecommendations } from '../engine/pathfinder.ts';
import type { MatchRecommendation } from '../engine/pathfinder.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

type ScopeFilter = 'all' | 'target' | 'rivals';

export default function PathFinderPlus() {
  const { projectionLeague: league, projectionMatches: matches, teams, strengths, simulation, simulationConfig } = useData();
  const { t, lang } = useI18n();

  const [recommendations, setRecommendations] = useState<MatchRecommendation[] | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  // Full-season sweep is a heavier computation (~1s for ~50 matches), so run it
  // once when the tab is opened rather than blocking every app load.
  useEffect(() => {
    if (!simulation) return;
    setIsComputing(true);
    const timer = setTimeout(() => {
      setRecommendations(
        analyzeAllMatchRecommendations(league, teams, matches, strengths, simulationConfig)
      );
      setIsComputing(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [league, teams, matches, strengths, simulation, simulationConfig]);

  const [scope, setScope] = useState<ScopeFilter>('all');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const rounds = useMemo(() => {
    if (!recommendations) return [];
    return Array.from(new Set(recommendations.map((r) => r.round))).sort((a, b) => a - b);
  }, [recommendations]);

  const filtered = useMemo(() => {
    if (!recommendations) return [];
    return recommendations.filter((r) => {
      if (scope === 'target' && !r.involvesTarget) return false;
      if (scope === 'rivals' && r.involvesTarget) return false;
      if (selectedRound !== null && r.round !== selectedRound) return false;
      return true;
    });
  }, [recommendations, scope, selectedRound]);

  if (!simulation) {
    return <div className="page"><h2>{t('PATH FINDER+')}</h2><p>{t('Loading...')}</p></div>;
  }

  return (
    <div className="page">
      <h2>{t('PATH FINDER+')}</h2>
      <div className="panel full-width">
        <h3>{t('FULL-SEASON MATCH RECOMMENDATIONS')}</h3>
        <div className="path-description">
          {t("Every remaining match this season — target's own and every rival's — ranked by how much the outcome actually swings the target team's title probability. Sorted by impact (biggest swing first).")}
        </div>

        <div className="round-filter">
          <button className={`btn btn-sm ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>{t('ALL')}</button>
          <button className={`btn btn-sm ${scope === 'target' ? 'active' : ''}`} onClick={() => setScope('target')}>{t('OWN MATCHES')}</button>
          <button className={`btn btn-sm ${scope === 'rivals' ? 'active' : ''}`} onClick={() => setScope('rivals')}>{t('RIVAL MATCHES')}</button>
        </div>
        <div className="round-filter desktop-only-action">
          <button
            className={`btn btn-sm ${selectedRound === null ? 'active' : ''}`}
            onClick={() => setSelectedRound(null)}
          >
            {t('ALL ROUNDS')}
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
          <option value="">{t('ALL ROUNDS')}</option>
          {rounds.map((r) => (
            <option key={r} value={r}>R{r}</option>
          ))}
        </select>

        {isComputing || !recommendations ? (
          <div className="no-data">{t('Running locked-outcome simulations across the remaining season...')}</div>
        ) : filtered.length === 0 ? (
          <div className="no-data">{t('No matches match this filter.')}</div>
        ) : (
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('R')}</th>
                <th>{t('Match')}</th>
                <th>{t('Scope')}</th>
                <th>{t('Root For')}</th>
                <th>{t('Title Prob')}</th>
                <th>{t('Impact')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const homeName = getTeamName(teams, r.homeTeamId, lang);
                const awayName = getTeamName(teams, r.awayTeamId, lang);
                const rootLabel =
                  r.recommendedOutcome === 'home_win' ? `${homeName} ${t('WIN')}`
                  : r.recommendedOutcome === 'away_win' ? `${awayName} ${t('WIN')}`
                  : t('DRAW');
                return (
                  <tr key={r.matchId} className={r.involvesTarget ? 'target-row' : ''}>
                    <td>R{r.round}</td>
                    <td>{homeName} vs {awayName}</td>
                    <td>
                      <span className={`badge ${r.involvesTarget ? 'badge-must-win' : 'badge-low'}`}>
                        {r.involvesTarget ? t('OWN') : t('RIVAL')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${r.recommendedOutcome === 'draw' ? 'medium' : 'low'}`}>
                        {rootLabel}
                      </span>
                    </td>
                    <td>{(r.bestProb * 100).toFixed(1)}%</td>
                    <td>{r.impact > 0.001 ? `±${(r.impact * 100).toFixed(1)}pp` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
