import { useData } from '../hooks/useData';
import { useI18n } from '../i18n/I18nContext.tsx';
import { pickTeamShort, pickTeamDisplay } from '../utils/helpers';
import { HoverInfo } from '../components/HoverInfo';
import { interpretGoalDiff, interpretStrength } from '../utils/interpret.ts';

// Explains a games-in-hand gap: fixed number of rounds missed due to a bye
// (odd team count -> one team sits out each round) vs actually postponed
// matches, since only one of those means "still owes a game".
function gamesInHandReason(byeRounds: number, postponedRounds: number, t: (s: string) => string): string {
  const lines = [`${t('Bye rounds')}: ${byeRounds} · ${t('Postponed')}: ${postponedRounds}`];
  if (byeRounds > 0) lines.push(t('odd number of teams — one sits out each round, no game owed'));
  if (postponedRounds > 0) lines.push(t('game still owed, will count once rescheduled'));
  if (byeRounds === 0 && postponedRounds === 0) lines.push(t('Behind on games played — reason unclear from current data.'));
  return lines.join('\n');
}

export default function Standings() {
  const { league, teams, standings, strengths } = useData();
  const { t, lang } = useI18n();
  const maxPlayed = standings.reduce((max, s) => Math.max(max, s.matchesPlayed), 0);

  return (
    <div className="page">
      <h2>{t('STANDINGS')}</h2>
      <div className="panel full-width">
        <div className="table-scroll">
        <table className="dense-table standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="team-col">{t('Team')}</th>
              <th><HoverInfo text={t('Matches played so far.')}>{t('P')}</HoverInfo></th>
              <th><HoverInfo text={t('Wins.')}>{t('W')}</HoverInfo></th>
              <th><HoverInfo text={t('Draws.')}>{t('D')}</HoverInfo></th>
              <th><HoverInfo text={t('Losses.')}>{t('L')}</HoverInfo></th>
              <th><HoverInfo text={t('Goals scored.')}>{t('GF')}</HoverInfo></th>
              <th><HoverInfo text={t('Goals conceded.')}>{t('GA')}</HoverInfo></th>
              <th><HoverInfo text={t('Goal difference: goals scored minus goals conceded.')}>{t('GD')}</HoverInfo></th>
              <th><HoverInfo text={t('Points: win = 3, draw = 1, loss = 0 (per this league\'s rules).')}>{t('Pts')}</HoverInfo></th>
              <th><HoverInfo text={t('Result of each of the last 5 matches, oldest to newest.')}>{t('Form')}</HoverInfo></th>
              <th><HoverInfo text={t('Simulated overall strength rating, 0-100 scale (50 = league-neutral). See the METHODOLOGY tab for how this is computed.')}>{t('Str')}</HoverInfo></th>
              <th><HoverInfo text={t('Games remaining this season.')}>{t('GP')}</HoverInfo></th>
              <th><HoverInfo text={t('Maximum possible final points if this team wins every remaining match.')}>{t('MXP')}</HoverInfo></th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const team = teams.find((t) => t.id === s.teamId);
              const str = strengths.get(s.teamId);
              const isTarget = s.teamId === league.targetTeamId;
              const isTop4 = s.position <= 4;
              const isRelegation = s.position >= teams.length - 2;

              return (
                <tr
                  key={s.teamId}
                  className={`${isTarget ? 'target-row' : ''} ${isTop4 ? 'top4-row' : ''} ${isRelegation ? 'relegation-row' : ''}`}
                >
                  <td className="position-cell">{s.position}</td>
                  <td className="team-col">
                    <span className={`team-badge ${isTarget ? 'target' : ''}`}>
                      {team ? pickTeamShort(team, lang) : s.teamId}
                    </span>
                    <span className="team-fullname">{team ? pickTeamDisplay(team, lang) : ''}</span>
                  </td>
                  <td>
                    {s.matchesPlayed}
                    {s.matchesPlayed < maxPlayed && (
                      <HoverInfo text={gamesInHandReason(s.byeRounds, s.postponedRounds, t)}>
                        <span className="games-in-hand"> ({s.matchesPlayed - maxPlayed})</span>
                      </HoverInfo>
                    )}
                  </td>
                  <td>{s.wins}</td>
                  <td>{s.draws}</td>
                  <td>{s.losses}</td>
                  <td>{s.goalsFor}</td>
                  <td>{s.goalsAgainst}</td>
                  <td className={s.goalDifference >= 0 ? 'positive' : 'negative'}>
                    <HoverInfo text={interpretGoalDiff(s.goalDifference, lang)}>
                      {s.goalDifference > 0 ? '+' : ''}{s.goalDifference}
                    </HoverInfo>
                  </td>
                  <td className="points-cell">{s.points}</td>
                  <td className="form-cell">
                    {s.form.last5.map((r, i) => (
                      <span key={i} className={`form-dot form-${r === 'W' ? 'w' : r === 'D' ? 'd' : 'l'}`}>
                        {r}
                      </span>
                    ))}
                  </td>
                  <td>
                    {str ? (
                      <HoverInfo text={interpretStrength(str.overall, lang)}>{str.overall.toFixed(0)}</HoverInfo>
                    ) : '-'}
                  </td>
                  <td>{s.gamesRemaining}</td>
                  <td>{s.maxPossiblePoints}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="standings-legend">
        <div className="legend-item"><span className="legend-color top4"></span> {t('Top 4')}</div>
        <div className="legend-item"><span className="legend-color target"></span> {t('Target Team')}</div>
        <div className="legend-item"><span className="legend-color relegation"></span> {t('Relegation Zone')}</div>
      </div>
    </div>
  );
}
