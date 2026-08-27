import { useData } from '../hooks/useData';
import { getTeamName, pickTeamShort } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext.tsx';
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

export default function Projection() {
  const { league, teams, simulation, strengths } = useData();
  const { t, lang } = useI18n();

  if (!simulation) {
    return <div className="page"><h2>{t('PROJECTION')}</h2><p>{t('Loading simulation data...')}</p></div>;
  }

  // Target team final position distribution
  const targetResult = simulation.results.find((r) => r.teamId === league.targetTeamId);
  const positionData = targetResult
    ? Object.entries(targetResult.positionProbabilities)
        .map(([pos, prob]) => ({
          position: `Pos ${pos}`,
          probability: Math.round(prob * 1000) / 10,
        }))
        .filter((d) => d.probability > 0.5)
    : [];

  // All teams title probabilities
  const titleData = simulation.results
    .filter((r) => r.titleProbability > 0.01)
    .sort((a, b) => b.titleProbability - a.titleProbability)
    .map((r) => ({
      name: getTeamName(teams, r.teamId, lang),
      value: Math.round(r.titleProbability * 1000) / 10,
    }));

  // Expected standings (by avg finishing position)
  const expectedStandings = [...simulation.results]
    .sort((a, b) => a.avgFinishingPosition - b.avgFinishingPosition)
    .map((r, i) => ({
      position: i + 1,
      team: getTeamName(teams, r.teamId, lang),
      avgFinish: r.avgFinishingPosition,
      titleProb: Math.round(r.titleProbability * 1000) / 10,
      top2Prob: Math.round(r.top2Probability * 1000) / 10,
      expectedPts: r.expectedFinalPoints,
      minPos: r.minPosition,
      maxPos: r.maxPosition,
      isTarget: r.teamId === league.targetTeamId,
    }));

  return (
    <div className="page">
      <h2>{t('PROJECTION')}</h2>
      <div className="projection-meta">
        <span>{t('Simulation Count')}: {simulation.config.count.toLocaleString()}</span>
        <span>{t('Assumptions')}: {simulation.config.assumptions.toUpperCase()}</span>
        <span>{t('Form Weight')}: {simulation.config.formWeighting}</span>
        <span>{t('Generated')}: {new Date(simulation.generatedAt).toLocaleString()}</span>
      </div>

      <div className="projection-grid">
        {/* Target Team Position Distribution */}
        <div className="panel chart-panel">
          <h3>{t('FINAL POSITION DISTRIBUTION')} — {getTeamName(teams, league.targetTeamId, lang)}</h3>
          {positionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={positionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="position" tick={{ fontSize: 10, fill: '#aaa' }} />
                <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
                <Bar dataKey="probability" fill="#e74c3c" name="Probability %" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">{t('No position data available')}</div>
          )}
        </div>

        {/* Title Probability Pie */}
        <div className="panel chart-panel">
          <h3>{t('TITLE RACE')}</h3>
          {titleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={titleData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}%`}
                  labelLine={false}
                  style={{ fontSize: 9 }}
                >
                  {titleData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">{t('No title data')}</div>
          )}
        </div>
      </div>

      {/* Expected Standings Table */}
      <div className="panel full-width">
        <h3>{t('PROJECTED FINAL STANDINGS')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('Team')}</th>
              <th>{t('Avg Finish')}</th>
              <th>{t('Title %')}</th>
              <th>{t('Top 2 %')}</th>
              <th>{t('Exp Pts')}</th>
              <th>{t('Min Pos')}</th>
              <th>{t('Max Pos')}</th>
            </tr>
          </thead>
          <tbody>
            {expectedStandings.map((s) => (
              <tr key={s.team} className={s.isTarget ? 'target-row' : ''}>
                <td>{s.position}</td>
                <td>{s.team}</td>
                <td>{s.avgFinish.toFixed(1)}</td>
                <td className={s.titleProb > 10 ? 'highlight' : ''}>{s.titleProb}%</td>
                <td>{s.top2Prob}%</td>
                <td>{s.expectedPts}</td>
                <td>{s.minPos}</td>
                <td>{s.maxPos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model Confidence */}
      <div className="panel full-width">
        <h3>{t('MODEL CONFIDENCE')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('Team')}</th>
              <th>{t('Strength')}</th>
              <th>{t('Uncertainty')}</th>
              <th>{t('Confidence')}</th>
              <th>{t('Games Analyzed')}</th>
              <th>{t('Schedule Difficulty')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const str = strengths.get(t.id);
              if (!str) return null;
              return (
                <tr key={t.id} className={t.id === league.targetTeamId ? 'target-row' : ''}>
                  <td>{pickTeamShort(t, lang)}</td>
                  <td>{str.overall.toFixed(1)}</td>
                  <td>±{str.uncertainty.toFixed(1)}</td>
                  <td>{Math.max(0, 100 - str.uncertainty * 3).toFixed(0)}%</td>
                  <td>{str.gamesAnalyzed}</td>
                  <td>{str.scheduleDifficulty.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
