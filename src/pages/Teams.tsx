import { useData } from '../hooks/useData';
import { useI18n } from '../i18n/I18nContext.tsx';
import { pickTeamShort, pickTeamDisplay } from '../utils/helpers';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function Teams() {
  const { league, teams, standings, strengths, simulation } = useData();
  const { t, lang } = useI18n();

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
            <div key={team.id} className={`panel team-panel ${isTarget ? 'target-panel' : ''}`}>
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
                    {standing?.goalDifference ?? 0 > 0 ? '+' : ''}{standing?.goalDifference ?? 0}
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
