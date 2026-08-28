import { useData } from '../hooks/useData';
import { getTeamName, pickTeamShort, pickTeamDisplay } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext.tsx';
import { HoverInfo } from '../components/HoverInfo';
import { interpretProbability, interpretGoalDiff, interpretMatchPrediction } from '../utils/interpret.ts';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#95a5a6', '#d35400'];

export default function Overview() {
  const { league, teams, matches, standings, simulation, predictions, strengths, pathResult, rootingGuide, rootingRounds, rootingRound, setRootingRound } = useData();
  const { t, lang } = useI18n();

  const targetStanding = standings.find((s) => s.teamId === league.targetTeamId);
  const targetTeam = teams.find((t) => t.id === league.targetTeamId);
  const targetResult = simulation?.results.find((r) => r.teamId === league.targetTeamId);

  // Top 5 teams for chart
  const topTeams = standings.slice(0, 5).map((s, i) => ({
    name: getTeamName(teams, s.teamId, lang),
    points: s.points,
    fill: COLORS[i],
  }));

  // Title probability chart
  const titleProbs = simulation?.results
    .filter((r) => r.titleProbability > 0.01)
    .sort((a, b) => b.titleProbability - a.titleProbability)
    .slice(0, 6)
    .map((r) => ({
      name: getTeamName(teams, r.teamId, lang),
      value: Math.round(r.titleProbability * 1000) / 10,
    })) ?? [];

  // Next matches
  const nextMatches = predictions
    .filter((p) =>
      p.homeTeamId === league.targetTeamId ||
      p.awayTeamId === league.targetTeamId
    )
    .slice(0, 3);

  // Critical matches
  const criticalMatches = simulation?.criticalMatches
    .filter((c) => c.classification === 'CRITICAL' || c.classification === 'HIGH')
    .slice(0, 5) ?? [];

  // Our team's single most important upcoming match — the soonest match
  // ranked highest by must-win classification (not just "next match", and
  // not diluted by rival matches like the Critical Matches panel is).
  const classificationRank: Record<string, number> = {
    MUST_WIN: 0, WIN_PREFERRED: 1, DRAW_ACCEPTABLE: 2, DONT_LOSE: 3, LOW_IMPACT: 4,
  };
  const keyMatch = pathResult
    ? [...pathResult.mustWinMatches].sort((a, b) => {
        const rankDiff = (classificationRank[a.classification] ?? 9) - (classificationRank[b.classification] ?? 9);
        return rankDiff !== 0 ? rankDiff : a.round - b.round;
      })[0]
    : undefined;
  const keyMatchPrediction = keyMatch ? predictions.find((p) => p.matchId === keyMatch.matchId) : undefined;

  return (
    <div className="page">
      <h2>{t('OVERVIEW')} — {targetTeam ? pickTeamDisplay(targetTeam, lang) : t('Target Team')}</h2>

      <div className="overview-grid">
        {/* Current Status */}
        <div className="panel">
          <h3>{t('CURRENT STATUS')}</h3>
          <div className="stat-row">
            <span className="stat-label">{t('Position')}</span>
            <span className="stat-value big">{targetStanding?.position ?? '-'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Points')}</span>
            <span className="stat-value">{targetStanding?.points ?? 0}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Goal Diff')}</span>
            <HoverInfo text={interpretGoalDiff(targetStanding?.goalDifference ?? 0, lang)}>
              <span className={`stat-value ${((targetStanding?.goalDifference ?? 0) >= 0 ? 'positive' : 'negative')}`}>
                {(targetStanding?.goalDifference ?? 0) > 0 ? '+' : ''}{targetStanding?.goalDifference ?? 0}
              </span>
            </HoverInfo>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Record')}</span>
            <span className="stat-value">
              {targetStanding?.wins ?? 0}{t('W')} {targetStanding?.draws ?? 0}{t('D')} {targetStanding?.losses ?? 0}{t('L')}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Gap to 1st')}</span>
            <span className="stat-value">{targetStanding?.pointsGapToFirst ?? 0} {t('pts')}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Games Remaining')}</span>
            <span className="stat-value">{targetStanding?.gamesRemaining ?? 0}</span>
          </div>
        </div>

        {/* Title Probability */}
        <div className="panel">
          <h3>{t('TITLE PROBABILITY')}</h3>
          <div className="stat-row">
            <span className="stat-label">{t('1st Place')}</span>
            <HoverInfo text={targetResult ? interpretProbability(targetResult.titleProbability, lang) : ''}>
              <span className="stat-value big accent">
                {targetResult ? `${Math.round(targetResult.titleProbability * 1000) / 10}%` : 'N/A'}
              </span>
            </HoverInfo>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Top 2')}</span>
            <span className="stat-value">
              {targetResult ? `${Math.round(targetResult.top2Probability * 1000) / 10}%` : 'N/A'}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Top 4')}</span>
            <span className="stat-value">
              {targetResult ? `${Math.round(targetResult.top4Probability * 1000) / 10}%` : 'N/A'}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Avg Finish')}</span>
            <span className="stat-value">
              {targetResult ? targetResult.avgFinishingPosition.toFixed(1) : 'N/A'}
            </span>
          </div>
        </div>

        {/* Title Status */}
        <div className="panel">
          <h3>{t('TITLE STATUS')}</h3>
          <div className="title-status-badge">
            {pathResult ? (
              <>
                <div className={`status-code status-${pathResult.titleStatus.code.toLowerCase()}`}>
                  {t(pathResult.titleStatus.label)}
                </div>
                <div className="status-desc">{pathResult.titleStatus.description}</div>
                {targetResult && (
                  <div className="status-prob">
                    {Math.round(targetResult.titleProbability * 100)}% {t('title probability')}
                  </div>
                )}
                {pathResult.titleStatus.isMathematical && (
                  <div className="mathematical-note">★ {t('Mathematical certainty')}</div>
                )}
              </>
            ) : simulation ? (
              <>
                <div className="status-code">{t('ANALYZING')}</div>
                <div className="status-desc">{t('Based on')} {simulation.config.count.toLocaleString()} {t('simulations')}</div>
              </>
            ) : (
              <div className="status-loading">{t('Loading...')}</div>
            )}
          </div>
        </div>

        {/* Our Key Match */}
        {keyMatch && (
          <div className="panel">
            <h3>{t('OUR KEY MATCH')}</h3>
            <div className="stat-row">
              <span className="stat-label">R{keyMatch.round}</span>
              <span className={`badge badge-${keyMatch.classification.toLowerCase().replace('_', '-')}`}>
                {t(keyMatch.classification)}
              </span>
            </div>
            <div className="status-desc" style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>
              {keyMatch.homeTeamId === league.targetTeamId ? t('HOME') : t('AWAY')} {t('vs')} {getTeamName(teams, keyMatch.homeTeamId === league.targetTeamId ? keyMatch.awayTeamId : keyMatch.homeTeamId, lang)}
            </div>
            {keyMatch.reasons.map((r, i) => (
              <div key={i} className="reason">{r}</div>
            ))}
            {keyMatchPrediction && (
              <div className="stat-row" style={{ marginTop: 6 }}>
                <span className="stat-label">{t('This match')}</span>
                <span className="stat-value">
                  {Math.round(keyMatchPrediction.homeWinProb * 100)}/{Math.round(keyMatchPrediction.drawProb * 100)}/{Math.round(keyMatchPrediction.awayWinProb * 100)}
                </span>
              </div>
            )}
            <div className="stat-row">
              <span className="stat-label">{t('Title prob if win/draw/loss')}</span>
              <span className="stat-value">
                {Math.round(keyMatch.titleProbBeforeWin * 100)}/{Math.round(keyMatch.titleProbBeforeDraw * 100)}/{Math.round(keyMatch.titleProbBeforeLoss * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Points Chart */}
        <div className="panel chart-panel">
          <h3>{t('TOP 5 STANDINGS')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topTeams} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#aaa' }} />
              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              <Bar dataKey="points" fill="#e74c3c" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Title Probability Pie */}
        <div className="panel chart-panel">
          <h3>{t('TITLE RACE PROBABILITIES')}</h3>
          {titleProbs.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={titleProbs}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}%`}
                  labelLine={false}
                  style={{ fontSize: 9 }}
                >
                  {titleProbs.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">{t('No title probability data')}</div>
          )}
        </div>

        {/* Next Matches */}
        <div className="panel">
          <h3>{t('NEXT MATCHES')}</h3>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('R')}</th>
                <th>{t('Match')}</th>
                <th>{t('Home')}</th>
                <th>{t('Draw')}</th>
                <th>{t('Away')}</th>
              </tr>
            </thead>
            <tbody>
              {nextMatches.map((m) => {
                const homeStr = strengths.get(m.homeTeamId);
                const awayStr = strengths.get(m.awayTeamId);
                const homeStanding = standings.find((s) => s.teamId === m.homeTeamId);
                const awayStanding = standings.find((s) => s.teamId === m.awayTeamId);
                const reason = homeStr && awayStr
                  ? interpretMatchPrediction(
                      getTeamName(teams, m.homeTeamId, lang),
                      getTeamName(teams, m.awayTeamId, lang),
                      homeStr, awayStr,
                      m.homeWinProb, m.drawProb, m.awayWinProb,
                      lang,
                      homeStanding,
                      awayStanding
                    )
                  : '';
                return (
                  <tr key={m.matchId}>
                    <td>{matches.find((match) => match.id === m.matchId)?.round}</td>
                    <td className="match-cell">
                      {getTeamName(teams, m.homeTeamId, lang)} vs {getTeamName(teams, m.awayTeamId, lang)}
                    </td>
                    <td className={m.homeWinProb > 0.4 ? 'highlight' : ''}>
                      <HoverInfo text={reason}>{Math.round(m.homeWinProb * 100)}%</HoverInfo>
                    </td>
                    <td><HoverInfo text={reason}>{Math.round(m.drawProb * 100)}%</HoverInfo></td>
                    <td className={m.awayWinProb > 0.4 ? 'highlight' : ''}>
                      <HoverInfo text={reason}>{Math.round(m.awayWinProb * 100)}%</HoverInfo>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Critical Matches */}
        <div className="panel">
          <h3>{t('CRITICAL MATCHES')}</h3>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Match')}</th>
                <th>{t('Impact')}</th>
                <th>{t('Class')}</th>
              </tr>
            </thead>
            <tbody>
              {criticalMatches.map((c) => (
                <tr key={c.matchId} className={`critical-${c.classification.toLowerCase()}`}>
                  <td>{c.explanation}</td>
                  <td>{c.impactScore.toFixed(1)}</td>
                  <td>
                    <span className={`badge badge-${c.classification.toLowerCase()}`}>
                      {t(c.classification)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Next-Round Rooting Guide */}
        <div className="panel">
          <h3>{t('ROOTING GUIDE')}</h3>
          <div className="round-filter desktop-only-action">
            {rootingRounds.map((r) => (
              <button
                key={r}
                className={`btn btn-sm ${(rootingRound ?? rootingRounds[0]) === r ? 'active' : ''}`}
                onClick={() => setRootingRound(r)}
              >
                R{r}
              </button>
            ))}
          </div>
          {rootingRounds.length > 1 && (
            <select
              className="select-field mobile-only-action mobile-round-select"
              value={rootingRound ?? rootingRounds[0]}
              onChange={(e) => setRootingRound(Number(e.target.value))}
            >
              {rootingRounds.map((r) => (
                <option key={r} value={r}>R{r}</option>
              ))}
            </select>
          )}
          {rootingGuide.length === 0 ? (
            <div className="no-data">{t('No rival matches next round, or still computing...')}</div>
          ) : (
            <table className="dense-table">
              <thead>
                <tr>
                  <th>{t('Match')}</th>
                  <th>{t('Root For')}</th>
                  <th>{t('Title Prob')}</th>
                  <th>{t('Swing')}</th>
                </tr>
              </thead>
              <tbody>
                {rootingGuide.map((r) => {
                  const homeName = getTeamName(teams, r.homeTeamId, lang);
                  const awayName = getTeamName(teams, r.awayTeamId, lang);
                  const rootLabel =
                    r.recommendedOutcome === 'home_win' ? `${homeName} ${t('WIN')}`
                    : r.recommendedOutcome === 'away_win' ? `${awayName} ${t('WIN')}`
                    : t('DRAW');
                  return (
                    <tr key={r.matchId}>
                      <td>{homeName} vs {awayName}</td>
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

        {/* Team Strength */}
        <div className="panel">
          <h3>{t('TEAM STRENGTH ESTIMATES')}</h3>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Team')}</th>
                <th>{t('Overall')}</th>
                <th>{t('Attack')}</th>
                <th>{t('Defense')}</th>
                <th>{t('Form')}</th>
                <th>{t('Uncertainty')}</th>
              </tr>
            </thead>
            <tbody>
              {teams.slice(0, 8).map((team) => {
                const str = strengths.get(team.id);
                return (
                  <tr key={team.id} className={team.id === league.targetTeamId ? 'target-row' : ''}>
                    <td>{pickTeamShort(team, lang)}</td>
                    <td>{str?.overall.toFixed(1) ?? 'N/A'}</td>
                    <td>{str?.attack.toFixed(1) ?? 'N/A'}</td>
                    <td>{str?.defense.toFixed(1) ?? 'N/A'}</td>
                    <td>{str?.formRating.toFixed(1) ?? 'N/A'}</td>
                    <td>±{str?.uncertainty.toFixed(1) ?? 'N/A'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
