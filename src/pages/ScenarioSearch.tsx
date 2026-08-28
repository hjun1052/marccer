import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import { searchTitleScenarios } from '../engine/scenarioSearch.ts';
import type { TitleScenarioSearchResult } from '../engine/scenarioSearch.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export default function ScenarioSearch() {
  const { projectionLeague: league, projectionMatches: matches, teams, strengths, simulation, simulationConfig } = useData();
  const { t, lang } = useI18n();

  const [result, setResult] = useState<TitleScenarioSearchResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [targetPointsInput, setTargetPointsInput] = useState('');
  const [filterMode, setFilterMode] = useState<'exact' | 'atLeast'>('atLeast');

  // One locked sub-simulation per distinct win/draw/loss split (not per raw
  // combination), so this stays fast even though 3^n grows quickly.
  useEffect(() => {
    if (!simulation) return;
    setIsComputing(true);
    const timer = setTimeout(() => {
      setResult(searchTitleScenarios(league, teams, matches, strengths, simulationConfig));
      setIsComputing(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [league, teams, matches, strengths, simulation, simulationConfig]);

  const summary = useMemo(() => {
    if (!result) return null;
    const viableCombos = result.buckets
      .filter((b) => b.titleProbability > 0.5)
      .reduce((sum, b) => sum + b.comboCount, 0);
    const guaranteedCombos = result.buckets
      .filter((b) => b.titleProbability >= 0.999)
      .reduce((sum, b) => sum + b.comboCount, 0);
    const best = result.buckets[0];
    return { viableCombos, guaranteedCombos, best };
  }, [result]);

  const targetPoints = targetPointsInput.trim() === '' ? null : Number(targetPointsInput);
  const filteredBuckets = useMemo(() => {
    if (!result) return [];
    if (targetPoints === null || Number.isNaN(targetPoints)) return result.buckets;
    return result.buckets.filter((b) => (filterMode === 'exact' ? b.points === targetPoints : b.points >= targetPoints));
  }, [result, targetPoints, filterMode]);

  const filterSummary = useMemo(() => {
    if (targetPoints === null || Number.isNaN(targetPoints) || filteredBuckets.length === 0) return null;
    const totalCombos = filteredBuckets.reduce((sum, b) => sum + b.comboCount, 0);
    const minProb = Math.min(...filteredBuckets.map((b) => b.titleProbability));
    const maxProb = Math.max(...filteredBuckets.map((b) => b.titleProbability));
    return { totalCombos, minProb, maxProb };
  }, [filteredBuckets, targetPoints]);

  if (!simulation) {
    return <div className="page"><h2>{t('SCENARIO SEARCH')}</h2><p>{t('Loading...')}</p></div>;
  }

  return (
    <div className="page">
      <h2>{t('SCENARIO SEARCH')}</h2>
      <div className="panel full-width">
        <h3>{t('WHICH RESULT COMBINATIONS WIN THE TITLE')}</h3>
        <div className="path-description">
          {t('Every remaining match for the target team, grouped by win/draw/loss split rather than listed one by one. Each row is one representative match-by-match assignment for that split — title probability can vary a little between different assignments of the same split (who you beat matters slightly), so treat it as a close estimate for the whole group.')}
        </div>

        {result && (
          <div className="scenario-instructions">
            {t('Remaining matches')}: {result.targetMatches.length} · {t('Total combinations')}: {result.totalCombinations.toLocaleString()}
            {summary && (
              <>
                {' · '}{t('Combos likely to win (>50%)')}: {summary.viableCombos.toLocaleString()}
                {' · '}{t('Combos that guarantee it')}: {summary.guaranteedCombos.toLocaleString()}
              </>
            )}
          </div>
        )}

        <div className="sim-config" style={{ marginTop: 8, marginBottom: 8 }}>
          <div className="config-group">
            <label>{t('Target Points')}</label>
            <input
              type="number"
              className="input-field"
              style={{ width: 90 }}
              value={targetPointsInput}
              onChange={(e) => setTargetPointsInput(e.target.value)}
              placeholder={t('e.g. 60')}
            />
          </div>
          <div className="config-group">
            <label>{t('Condition')}</label>
            <select className="select-field" value={filterMode} onChange={(e) => setFilterMode(e.target.value as 'exact' | 'atLeast')}>
              <option value="atLeast">{t('This many points or more')}</option>
              <option value="exact">{t('Exactly this many points')}</option>
            </select>
          </div>
          {targetPointsInput.trim() !== '' && (
            <button className="btn btn-sm" onClick={() => setTargetPointsInput('')}>{t('CLEAR')}</button>
          )}
        </div>

        {filterSummary && (
          <div className="scenario-instructions">
            {filterMode === 'exact'
              ? t('Splits landing on exactly this points total')
              : t('Splits reaching at least this points total')}
            : {filterSummary.totalCombos.toLocaleString()} {t('combos')} ·{' '}
            {t('title probability ranges')} {(filterSummary.minProb * 100).toFixed(1)}%–{(filterSummary.maxProb * 100).toFixed(1)}%
          </div>
        )}

        {isComputing || !result ? (
          <div className="no-data">{t('Running one simulation per win/draw/loss split...')}</div>
        ) : filteredBuckets.length === 0 ? (
          <div className="no-data">{t('No win/draw/loss split reaches that points total.')}</div>
        ) : (
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Split')}</th>
                <th>{t('Pts')}</th>
                <th>{t('Combos')}</th>
                <th>{t('Title Prob')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuckets.map((b) => (
                <tr key={`${b.wins}-${b.draws}-${b.losses}`} className={b.titleProbability >= 0.999 ? 'target-row' : ''}>
                  <td>{b.wins}{t('W')} {b.draws}{t('D')} {b.losses}{t('L')}</td>
                  <td className="points-cell">{b.points}</td>
                  <td>{b.comboCount.toLocaleString()}</td>
                  <td className={b.titleProbability > 0.5 ? 'highlight' : ''}>{(b.titleProbability * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {result && (
        <div className="panel full-width">
          <h3>{t('REMAINING MATCHES USED IN THIS SEARCH')}</h3>
          <div className="path-description">
            {result.targetMatches.map((m) => `R${m.round} ${getTeamName(teams, m.homeTeamId, lang)} vs ${getTeamName(teams, m.awayTeamId, lang)}`).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
