import { useMemo } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext.tsx';

export default function History() {
  const { league, teams, matches } = useData();
  const { t: tt, lang } = useI18n();

  const completed = useMemo(() =>
    matches
      .filter((m) => m.status === 'completed')
      .sort((a, b) => a.round - b.round),
    [matches]
  );

  const rounds = useMemo(() => {
    const roundMap = new Map<number, typeof completed>();
    for (const m of completed) {
      if (!roundMap.has(m.round)) roundMap.set(m.round, []);
      roundMap.get(m.round)!.push(m);
    }
    return Array.from(roundMap.entries()).sort((a, b) => b[0] - a[0]);
  }, [completed]);

  // Target team timeline
  const targetTimeline = useMemo(() =>
    completed
      .filter(
        (m) =>
          m.homeTeamId === league.targetTeamId ||
          m.awayTeamId === league.targetTeamId
      )
      .map((m) => {
        const isHome = m.homeTeamId === league.targetTeamId;
        const won = isHome
          ? (m.homeScore ?? 0) > (m.awayScore ?? 0)
          : (m.awayScore ?? 0) > (m.homeScore ?? 0);
        const drew = m.homeScore === m.awayScore;
        return {
          round: m.round,
          result: won ? 'W' : drew ? 'D' : 'L',
          opponent: isHome
            ? getTeamName(teams, m.awayTeamId, lang)
            : getTeamName(teams, m.homeTeamId, lang),
          venue: isHome ? 'H' : 'A',
          score: `${m.homeScore}-${m.awayScore}`,
        };
      }),
    [completed, league.targetTeamId, teams, lang]
  );

  return (
    <div className="page">
      <h2>{tt('HISTORY')}</h2>

      {/* Target Team Form Timeline */}
      <div className="panel full-width">
        <h3>{tt('TARGET TEAM SEASON TIMELINE')}</h3>
        <div className="timeline">
          {targetTimeline.map((t) => (
            <div key={t.round} className={`timeline-item timeline-${t.result.toLowerCase()}`}>
              <div className="timeline-round">R{t.round}</div>
              <div className={`timeline-result result-${t.result.toLowerCase()}`}>
                {t.result}
              </div>
              <div className="timeline-detail">
                {t.venue} vs {t.opponent} ({t.score})
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Round-by-Round Results */}
      <div className="panel full-width">
        <h3>{tt('ROUND RESULTS (newest first)')}</h3>
        {rounds.map(([round, roundMatches]) => (
          <div key={round} className="round-section">
            <h4>{tt('Round')} {round}</h4>
            <table className="dense-table">
              <thead>
                <tr>
                  <th>{tt('Home')}</th>
                  <th>{tt('Score')}</th>
                  <th>{tt('Away')}</th>
                </tr>
              </thead>
              <tbody>
                {roundMatches.map((m) => {
                  const isTargetMatch =
                    m.homeTeamId === league.targetTeamId ||
                    m.awayTeamId === league.targetTeamId;
                  return (
                    <tr key={m.id} className={isTargetMatch ? 'target-row' : ''}>
                      <td className={(m.homeScore ?? 0) > (m.awayScore ?? 0) ? 'result-winner' : ''}>
                        {getTeamName(teams, m.homeTeamId, lang)}
                      </td>
                      <td className="score-cell">
                        <span className={`score ${(m.homeScore ?? 0) > (m.awayScore ?? 0) ? 'winner' : ''}`}>
                          {m.homeScore}
                        </span>
                        <span className="score-sep">-</span>
                        <span className={`score ${(m.awayScore ?? 0) > (m.homeScore ?? 0) ? 'winner' : ''}`}>
                          {m.awayScore}
                        </span>
                      </td>
                      <td className={(m.awayScore ?? 0) > (m.homeScore ?? 0) ? 'result-winner' : ''}>
                        {getTeamName(teams, m.awayTeamId, lang)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
