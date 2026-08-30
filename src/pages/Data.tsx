import { useMemo } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName, pickTeamShort, pickTeamDisplay } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext.tsx';
import { SectionTabs } from '../components/SectionTabs';

export default function Data() {
  // Raw data inspection/integrity check always looks at the real data, not
  // whatever round the time machine is currently viewing.
  const { league, teams, realMatches: matches, standings, strengths, simulation } = useData();
  const { t, lang } = useI18n();

  const completed = useMemo(() => matches.filter(m => m.status === 'completed'), [matches]);
  const scheduled = useMemo(() => matches.filter(m => m.status === 'scheduled'), [matches]);

  // Validate data integrity
  const issues = useMemo(() => {
    const errs: string[] = [];
    const ids = new Set<string>();
    for (const m of matches) {
      if (ids.has(m.id)) errs.push(`Duplicate match ID: ${m.id}`);
      ids.add(m.id);
      if (m.status === 'completed' && (m.homeScore === null || m.awayScore === null)) {
        errs.push(`${m.id}: completed but missing score`);
      }
      if (m.status === 'scheduled' && m.homeScore !== null) {
        errs.push(`${m.id}: scheduled but has score`);
      }
      if (!teams.find(t => t.id === m.homeTeamId)) errs.push(`${m.id}: unknown home team ${m.homeTeamId}`);
      if (!teams.find(t => t.id === m.awayTeamId)) errs.push(`${m.id}: unknown away team ${m.awayTeamId}`);
      if (m.homeTeamId === m.awayTeamId) errs.push(`${m.id}: team plays itself`);
    }
    return errs;
  }, [matches, teams]);

  return (
    <div className="page">
      <h2>{t('DATA')}</h2>

      <SectionTabs
        sections={[
          { id: 'info', label: t('INFO'), content: (<>
      {/* System Info */}
      <div className="panel full-width">
        <h3>{t('SYSTEM INFORMATION')}</h3>
        <div className="data-info-grid">
          <div className="stat-row"><span className="stat-label">{t('League Name')}</span><span className="stat-value">{lang === 'en' ? (league.nameEn ?? league.name) : league.name}</span></div>
          <div className="stat-row"><span className="stat-label">{t('League ID')}</span><span className="stat-value mono">{league.id}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Season')}</span><span className="stat-value">{lang === 'en' ? (league.seasonNameEn ?? league.seasonName) : league.seasonName} ({league.seasonId})</span></div>
          <div className="stat-row"><span className="stat-label">{t('Current Round')}</span><span className="stat-value">{league.currentRound} / {league.totalRounds}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Teams')}</span><span className="stat-value">{teams.length}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Target Team')}</span><span className="stat-value accent">{getTeamName(teams, league.targetTeamId, lang)}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Data Version')}</span><span className="stat-value mono">{league.dataVersion}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Model Version')}</span><span className="stat-value mono">{league.modelVersion}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Last Update')}</span><span className="stat-value">{league.lastDataUpdate}</span></div>
        </div>
      </div>

      {/* League Rules */}
      <div className="panel full-width">
        <h3>{t('LEAGUE RULES')}</h3>
        <div className="data-info-grid">
          <div className="stat-row"><span className="stat-label">{t('Win Points')}</span><span className="stat-value">{league.rules.winPoints}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Draw Points')}</span><span className="stat-value">{league.rules.drawPoints}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Loss Points')}</span><span className="stat-value">{league.rules.lossPoints}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Tiebreakers')}</span><span className="stat-value">
            {league.rules.tiebreakers.map((tb, i) => `${i + 1}. ${tb.type.replace(/_/g, ' ')}`).join(' → ')}
          </span></div>
        </div>
      </div>

      {/* Data Integrity */}
      <div className="panel full-width">
        <h3>{t('DATA INTEGRITY')}</h3>
        <div className="stat-row">
          <span className="stat-label">{t('Status')}</span>
          <span className={`stat-value ${issues.length === 0 ? 'positive' : 'negative'}`}>
            {issues.length === 0 ? `✅ ${t('ALL CHECKS PASSED')}` : `⚠ ${issues.length} ${t('ISSUE(S) FOUND')}`}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Total Matches')}</span>
          <span className="stat-value">{matches.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Completed')}</span>
          <span className="stat-value">{completed.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Scheduled')}</span>
          <span className="stat-value">{scheduled.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">{t('Expected per round')}</span>
          <span className="stat-value">{Math.floor(teams.length / 2)}</span>
        </div>
        {issues.length > 0 && (
          <div className="data-issues">
            {issues.map((issue, i) => (
              <div key={i} className="data-issue">⚠ {issue}</div>
            ))}
          </div>
        )}
      </div>

      </>) },
          { id: 'teams', label: t('TEAMS'), content: (<>
      {/* Teams Data */}
      <div className="panel full-width">
        <h3>{t('TEAMS')} ({teams.length})</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('ID')}</th>
              <th>{t('Name')}</th>
              <th>{t('Short')}</th>
              <th>{t('Rank')}</th>
              <th>{t('Pts')}</th>
              <th>{t('W-D-L')}</th>
              <th>{t('GD')}</th>
              <th>{t('Str')}</th>
              <th>{t('Unc')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const s = standings.find(st => st.teamId === t.id);
              const str = strengths.get(t.id);
              const isTarget = t.id === league.targetTeamId;
              return (
                <tr key={t.id} className={isTarget ? 'target-row' : ''}>
                  <td className="mono">{t.id}</td>
                  <td>{pickTeamShort(t, lang)}</td>
                  <td className="text-muted">{pickTeamDisplay(t, lang)}</td>
                  <td>{s?.position ?? '-'}</td>
                  <td>{s?.points ?? 0}</td>
                  <td>{s?.wins ?? 0}-{s?.draws ?? 0}-{s?.losses ?? 0}</td>
                  <td className={((s?.goalDifference ?? 0) >= 0 ? 'positive' : 'negative')}>
                    {(s?.goalDifference ?? 0) > 0 ? '+' : ''}{s?.goalDifference ?? 0}
                  </td>
                  <td>{str?.overall.toFixed(1) ?? '-'}</td>
                  <td>±{str?.uncertainty.toFixed(1) ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Team Strength Data */}
      <div className="panel full-width">
        <h3>{t('TEAM STRENGTH DATA')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('Team')}</th>
              <th>{t('Overall')}</th>
              <th>{t('Attack')}</th>
              <th>{t('Defense')}</th>
              <th>{t('Home')}</th>
              <th>{t('Away')}</th>
              <th>{t('Form')}</th>
              <th>{t('Uncertainty')}</th>
              <th>{t('Games')}</th>
              <th>{t('Sched Diff')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const str = strengths.get(t.id);
              if (!str) return null;
              return (
                <tr key={t.id}>
                  <td>{pickTeamShort(t, lang)}</td>
                  <td>{str.overall.toFixed(1)}</td>
                  <td>{str.attack.toFixed(1)}</td>
                  <td>{str.defense.toFixed(1)}</td>
                  <td>{str.homeStrength.toFixed(1)}</td>
                  <td>{str.awayStrength.toFixed(1)}</td>
                  <td>{str.formRating.toFixed(1)}</td>
                  <td>±{str.uncertainty.toFixed(1)}</td>
                  <td>{str.gamesAnalyzed}</td>
                  <td>{str.scheduleDifficulty.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </>) },
          { id: 'matches', label: t('MATCHES'), content: (<>
      {/* Match Data */}
      <div className="panel full-width">
        <h3>{t('MATCH DATA')} ({matches.length} {t('matches')})</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('ID')}</th>
              <th>{t('R')}</th>
              <th>{t('Date')}</th>
              <th>{t('Home')}</th>
              <th>{t('Score')}</th>
              <th>{t('Away')}</th>
              <th>{t('Status')}</th>
              <th>{t('Source')}</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const isTarget = m.homeTeamId === league.targetTeamId || m.awayTeamId === league.targetTeamId;
              return (
                <tr key={m.id} className={isTarget ? 'target-row' : ''}>
                  <td className="mono">{m.id}</td>
                  <td>{m.round}</td>
                  <td className="text-muted">{m.date?.slice(5) ?? '-'}</td>
                  <td>{getTeamName(teams, m.homeTeamId, lang)}</td>
                  <td className="score-cell">
                    {m.status === 'completed' ? (
                      <>
                        <span className={`score ${(m.homeScore ?? 0) > (m.awayScore ?? 0) ? 'winner' : ''}`}>{m.homeScore}</span>
                        <span className="score-sep">-</span>
                        <span className={`score ${(m.awayScore ?? 0) > (m.homeScore ?? 0) ? 'winner' : ''}`}>{m.awayScore}</span>
                      </>
                    ) : <span className="score-sep">vs</span>}
                  </td>
                  <td>{getTeamName(teams, m.awayTeamId, lang)}</td>
                  <td>
                    <span className={`badge badge-${m.status}`}>
                      {t(m.status)}
                    </span>
                  </td>
                  <td className="text-muted mono">{m.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Simulation Info */}
      {simulation && (
        <div className="panel full-width">
          <h3>{t('SIMULATION DATA')}</h3>
          <div className="data-info-grid">
            <div className="stat-row"><span className="stat-label">{t('Simulation Count')}</span><span className="stat-value">{simulation.config.count.toLocaleString()}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Assumptions')}</span><span className="stat-value">{simulation.config.assumptions}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Form Weight')}</span><span className="stat-value">{simulation.config.formWeighting}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Seed')}</span><span className="stat-value mono">{simulation.config.seed}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Generated')}</span><span className="stat-value">{new Date(simulation.generatedAt).toLocaleString()}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Results')}</span><span className="stat-value">{simulation.results.length} {t('teams')}</span></div>
            <div className="stat-row"><span className="stat-label">{t('Target Title Prob')}</span><span className="stat-value accent">{(simulation.targetTeamTitleProb * 100).toFixed(1)}%</span></div>
          </div>
        </div>
      )}

      </>) },
          { id: 'raw', label: t('RAW JSON'), content: (
      <div className="panel full-width">
        <h3>{t('LEAGUE CONFIG (JSON)')}</h3>
        <pre className="mono debug-block">{JSON.stringify(league, null, 2)}</pre>
      </div>
          ) },
        ]}
      />
    </div>
  );
}
