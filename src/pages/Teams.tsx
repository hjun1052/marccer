import { useEffect, useRef, useState } from 'react';
import { useData } from '../hooks/useData';
import { useI18n } from '../i18n/I18nContext.tsx';
import { getTeamName, pickTeamShort, pickTeamDisplay } from '../utils/helpers';
import { completedRoundsSoFar, computeTitleProbabilityAtRound } from '../engine/titleTrend.ts';
import type { TitleTrendPoint } from '../engine/titleTrend.ts';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const TREND_SIM_COUNT = 2000;

export default function Teams() {
  const { league, teams, standings, strengths, simulation } = useData();
  const { t, lang } = useI18n();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const strengthData = teams.map((t) => {
    const str = strengths.get(t.id);
    return {
      name: pickTeamShort(t, lang),
      overall: str?.overall ?? 0,
      attack: str?.attack ?? 0,
      defense: str?.defense ?? 0,
      form: str?.formRating ?? 0,
    };
  }).sort((a, b) => b.overall - a.overall);

  if (selectedTeamId) {
    return (
      <TeamDetail
        teamId={selectedTeamId}
        onBack={() => setSelectedTeamId(null)}
      />
    );
  }

  return (
    <div className="page">
      <h2>{t('TEAMS')}</h2>

      <div className="panel full-width chart-panel">
        <h3>{t('TEAM STRENGTH COMPARISON')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={strengthData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#aaa' }} />
            <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
            <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
            <Bar dataKey="overall" fill="#e74c3c" name="Overall" />
            <Bar dataKey="attack" fill="#3498db" name="Attack" />
            <Bar dataKey="defense" fill="#2ecc71" name="Defense" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="teams-grid">
        {teams.map((team) => {
          const str = strengths.get(team.id);
          const standing = standings.find((s) => s.teamId === team.id);
          const simResult = simulation?.results.find((r) => r.teamId === team.id);
          const isTarget = team.id === league.targetTeamId;

          return (
            <div
              key={team.id}
              className={`panel team-panel team-panel-clickable ${isTarget ? 'target-panel' : ''}`}
              onClick={() => setSelectedTeamId(team.id)}
            >
              <h3>
                {pickTeamDisplay(team, lang)}
                {isTarget && <span className="target-badge">{t('TARGET')}</span>}
              </h3>
              <div className="team-stats">
                <div className="stat-row">
                  <span className="stat-label">{t('Rank')}</span>
                  <span className="stat-value">{standing?.position ?? '-'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Points')}</span>
                  <span className="stat-value">{standing?.points ?? 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Record')}</span>
                  <span className="stat-value">
                    {standing?.wins ?? 0}{t('W')} {standing?.draws ?? 0}{t('D')} {standing?.losses ?? 0}{t('L')}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('GD')}</span>
                  <span className={`stat-value ${((standing?.goalDifference ?? 0) >= 0 ? 'positive' : 'negative')}`}>
                    {(standing?.goalDifference ?? 0) > 0 ? '+' : ''}{standing?.goalDifference ?? 0}
                  </span>
                </div>

                <div className="stat-divider"></div>

                <div className="stat-row">
                  <span className="stat-label">{t('Overall')}</span>
                  <span className="stat-value">{str?.overall.toFixed(1) ?? 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Attack')}</span>
                  <span className="stat-value">{str?.attack.toFixed(1) ?? 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Defense')}</span>
                  <span className="stat-value">{str?.defense.toFixed(1) ?? 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Form')}</span>
                  <span className="stat-value">{str?.formRating.toFixed(1) ?? 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Uncertainty')}</span>
                  <span className="stat-value">±{str?.uncertainty.toFixed(1) ?? 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Games Analyzed')}</span>
                  <span className="stat-value">{str?.gamesAnalyzed ?? 0}</span>
                </div>

                <div className="stat-divider"></div>

                <div className="stat-row">
                  <span className="stat-label">{t('Title Prob')}</span>
                  <span className="stat-value accent">
                    {simResult ? `${(simResult.titleProbability * 100).toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Avg Finish')}</span>
                  <span className="stat-value">
                    {simResult?.avgFinishingPosition.toFixed(1) ?? 'N/A'}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">{t('Form History')}</span>
                  <span className="stat-value form-history">
                    {str?.ratingHistory.slice(-5).map((r, i) => (
                      <span key={i} className="form-dot">{r.toFixed(0)}</span>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamDetail({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const { league, teams, matches, predictions, standings, strengths, simulation, simulationConfig } = useData();
  const { t, lang } = useI18n();

  const team = teams.find((tm) => tm.id === teamId);
  const standing = standings.find((s) => s.teamId === teamId);
  const str = strengths.get(teamId);
  const simResult = simulation?.results.find((r) => r.teamId === teamId);
  const isTarget = teamId === league.targetTeamId;

  const remaining = matches
    .filter((m) => m.status === 'scheduled' && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .sort((a, b) => a.round - b.round);
  const predMap = new Map(predictions.map((p) => [p.matchId, p]));

  // Retroactive title-probability trend for this specific team — same
  // engine as Overview's dashboard trend, just pointed at a different team.
  const [trend, setTrend] = useState<TitleTrendPoint[]>([]);
  const [trendComputing, setTrendComputing] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    if (!simulation) return;
    const rounds = completedRoundsSoFar(matches);
    if (rounds.length < 2) {
      setTrend([]);
      return;
    }
    setTrendComputing(true);
    setTrend([]);
    const trendConfig = { ...simulationConfig, count: Math.min(simulationConfig.count, TREND_SIM_COUNT) };

    const step = (i: number, acc: TitleTrendPoint[]) => {
      if (cancelRef.current) return;
      if (i >= rounds.length) {
        setTrend(acc);
        setTrendComputing(false);
        return;
      }
      const point = computeTitleProbabilityAtRound(league, teams, matches, trendConfig, teamId, rounds[i]);
      const next = [...acc, point];
      setTrend(next);
      setTimeout(() => step(i + 1, next), 0);
    };
    setTimeout(() => step(0, []), 0);

    return () => { cancelRef.current = true; };
  }, [league, teams, matches, simulation, simulationConfig, teamId]);

  if (!team) return null;

  return (
    <div className="page">
      <button className="btn btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>{t('BACK TO ALL TEAMS')}</button>
      <h2>
        {pickTeamDisplay(team, lang)}
        {isTarget && <span className="target-badge">{t('TARGET')}</span>}
      </h2>

      <div className="overview-grid">
        <div className="panel">
          <h3>{t('POSITION SUMMARY')}</h3>
          <div className="stat-row"><span className="stat-label">{t('Rank')}</span><span className="stat-value big">{standing?.position ?? '-'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Points')}</span><span className="stat-value">{standing?.points ?? 0}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Record')}</span><span className="stat-value">{standing?.wins ?? 0}{t('W')} {standing?.draws ?? 0}{t('D')} {standing?.losses ?? 0}{t('L')}</span></div>
          <div className="stat-row"><span className="stat-label">{t('GF')}</span><span className="stat-value">{standing?.goalsFor ?? 0}</span></div>
          <div className="stat-row"><span className="stat-label">{t('GA')}</span><span className="stat-value">{standing?.goalsAgainst ?? 0}</span></div>
          <div className="stat-row">
            <span className="stat-label">{t('GD')}</span>
            <span className={`stat-value ${((standing?.goalDifference ?? 0) >= 0 ? 'positive' : 'negative')}`}>
              {(standing?.goalDifference ?? 0) > 0 ? '+' : ''}{standing?.goalDifference ?? 0}
            </span>
          </div>
          <div className="stat-row"><span className="stat-label">{t('Form')}</span>
            <span className="form-cell">
              {standing?.form.last5.map((r, i) => (
                <span key={i} className={`form-dot form-${r === 'W' ? 'w' : r === 'D' ? 'd' : 'l'}`}>{r}</span>
              ))}
            </span>
          </div>
        </div>

        <div className="panel">
          <h3>{t('TEAM STRENGTH DATA')}</h3>
          <div className="stat-row"><span className="stat-label">{t('Overall')}</span><span className="stat-value">{str?.overall.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Attack')}</span><span className="stat-value">{str?.attack.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Defense')}</span><span className="stat-value">{str?.defense.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Home')}</span><span className="stat-value">{str?.homeStrength.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Away')}</span><span className="stat-value">{str?.awayStrength.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Uncertainty')}</span><span className="stat-value">±{str?.uncertainty.toFixed(1) ?? 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Games Analyzed')}</span><span className="stat-value">{str?.gamesAnalyzed ?? 0}</span></div>
        </div>

        <div className="panel">
          <h3>{t('TITLE PROBABILITY')}</h3>
          <div className="stat-row"><span className="stat-label">{t('Title Prob')}</span><span className="stat-value big accent">{simResult ? `${(simResult.titleProbability * 100).toFixed(1)}%` : 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Top 2 %')}</span><span className="stat-value">{simResult ? `${(simResult.top2Probability * 100).toFixed(1)}%` : 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Top 4 %')}</span><span className="stat-value">{simResult ? `${(simResult.top4Probability * 100).toFixed(1)}%` : 'N/A'}</span></div>
          <div className="stat-row"><span className="stat-label">{t('Avg Finish')}</span><span className="stat-value">{simResult?.avgFinishingPosition.toFixed(1) ?? 'N/A'}</span></div>
        </div>
      </div>

      <div className="panel full-width chart-panel">
        <h3>{t('TITLE PROBABILITY TREND')}</h3>
        {trend.length >= 2 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend.map((p) => ({ round: `R${p.round}`, prob: Math.round(p.titleProbability * 1000) / 10 }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#aaa' }} />
              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} unit="%" />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              <Line type="monotone" dataKey="prob" stroke="#e74c3c" name={t('title probability')} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : trendComputing ? (
          <div className="no-data">{t('Computing...')}</div>
        ) : (
          <div className="no-data">{t('Not enough completed rounds yet for a trend.')}</div>
        )}
      </div>

      <div className="panel full-width">
        <h3>{t('REMAINING FIXTURES')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('R')}</th>
              <th>{t('Venue')}</th>
              <th>{t('Opponent')}</th>
              <th>{t('H Win%')}</th>
              <th>{t('Draw%')}</th>
              <th>{t('A Win%')}</th>
            </tr>
          </thead>
          <tbody>
            {remaining.map((m) => {
              const isHome = m.homeTeamId === teamId;
              const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
              const pred = predMap.get(m.id);
              return (
                <tr key={m.id}>
                  <td>{m.round}</td>
                  <td>{isHome ? t('HOME') : t('AWAY')}</td>
                  <td>{getTeamName(teams, opponentId, lang)}</td>
                  <td>{pred ? `${Math.round(pred.homeWinProb * 100)}%` : '-'}</td>
                  <td>{pred ? `${Math.round(pred.drawProb * 100)}%` : '-'}</td>
                  <td>{pred ? `${Math.round(pred.awayWinProb * 100)}%` : '-'}</td>
                </tr>
              );
            })}
            {remaining.length === 0 && (
              <tr><td colSpan={6} className="no-data">{t('No remaining fixtures.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
