import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import { useI18n } from '../i18n/I18nContext.tsx';
import { HoverInfo } from '../components/HoverInfo';
import { SectionTabs } from '../components/SectionTabs';
import { interpretMatchPrediction } from '../utils/interpret.ts';

export default function Matches() {
  const { league, teams, matches, predictions, strengths, standings, matchNotes, setMatchNote } = useData();
  const { t, lang } = useI18n();

  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.round - a.round);

  const scheduled = matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.round - b.round);

  const predMap = new Map(predictions.map((p) => [p.matchId, p]));

  return (
    <div className="page">
      <h2>{t('MATCHES')}</h2>

      <SectionTabs
        sections={[
          { id: 'scheduled', label: t('SCHEDULED'), content: (
      <div className="panel full-width">
        <h3>{t('SCHEDULED')} ({scheduled.length})</h3>
        <div className="table-scroll">
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('R')}</th>
              <th>{t('Date')}</th>
              <th>{t('Home')}</th>
              <th>{t('Score')}</th>
              <th>{t('Away')}</th>
              <th>{t('H Win%')}</th>
              <th>{t('Draw%')}</th>
              <th>{t('A Win%')}</th>
              <th>{t('Exp Goals')}</th>
              <th>{t('Confidence')}</th>
              <th>{t('Note')}</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.slice(0, 30).map((m) => {
              const pred = predMap.get(m.id);
              const isTargetMatch =
                m.homeTeamId === league.targetTeamId ||
                m.awayTeamId === league.targetTeamId;
              const homeStr = strengths.get(m.homeTeamId);
              const awayStr = strengths.get(m.awayTeamId);
              const homeStanding = standings.find((s) => s.teamId === m.homeTeamId);
              const awayStanding = standings.find((s) => s.teamId === m.awayTeamId);
              const reason = pred && homeStr && awayStr
                ? interpretMatchPrediction(
                    getTeamName(teams, m.homeTeamId, lang),
                    getTeamName(teams, m.awayTeamId, lang),
                    homeStr, awayStr,
                    pred.homeWinProb, pred.drawProb, pred.awayWinProb,
                    lang,
                    homeStanding,
                    awayStanding
                  )
                : '';

              return (
                <tr key={m.id} className={isTargetMatch ? 'target-row' : ''}>
                  <td>{m.round}</td>
                  <td>{m.date?.slice(5) ?? '-'}</td>
                  <td className={m.homeTeamId === league.targetTeamId ? 'target-text' : ''}>
                    {getTeamName(teams, m.homeTeamId, lang)}
                  </td>
                  <td className="score-cell">vs</td>
                  <td className={m.awayTeamId === league.targetTeamId ? 'target-text' : ''}>
                    {getTeamName(teams, m.awayTeamId, lang)}
                  </td>
                  <td className={pred && pred.homeWinProb > 0.4 ? 'highlight' : ''}>
                    <HoverInfo text={reason}>{pred ? `${Math.round(pred.homeWinProb * 100)}%` : '-'}</HoverInfo>
                  </td>
                  <td><HoverInfo text={reason}>{pred ? `${Math.round(pred.drawProb * 100)}%` : '-'}</HoverInfo></td>
                  <td className={pred && pred.awayWinProb > 0.4 ? 'highlight' : ''}>
                    <HoverInfo text={reason}>{pred ? `${Math.round(pred.awayWinProb * 100)}%` : '-'}</HoverInfo>
                  </td>
                  <td>
                    {pred ? `${pred.expectedHomeGoals.toFixed(2)} - ${pred.expectedAwayGoals.toFixed(2)}` : '-'}
                  </td>
                  <td>
                    {pred ? `${pred.predictionConfidence.toFixed(0)}%` : '-'}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-field note-input"
                      style={{ fontSize: 10 }}
                      value={matchNotes[m.id] ?? ''}
                      onChange={(e) => setMatchNote(m.id, e.target.value)}
                      placeholder={t('Add a note...')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
          ) },
          { id: 'completed', label: t('COMPLETED'), content: (
      <div className="panel full-width">
        <h3>{t('COMPLETED (most recent first, showing last 30)')}</h3>
        <div className="table-scroll">
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('R')}</th>
              <th>{t('Date')}</th>
              <th>{t('Home')}</th>
              <th>{t('Score')}</th>
              <th>{t('Away')}</th>
              <th>{t('Note')}</th>
            </tr>
          </thead>
          <tbody>
            {completed.slice(0, 30).map((m) => {
              const isTargetMatch =
                m.homeTeamId === league.targetTeamId ||
                m.awayTeamId === league.targetTeamId;
              const isHomeWin = (m.homeScore ?? 0) > (m.awayScore ?? 0);
              const isAwayWin = (m.awayScore ?? 0) > (m.homeScore ?? 0);

              return (
                <tr key={m.id} className={isTargetMatch ? 'target-row' : ''}>
                  <td>{m.round}</td>
                  <td>{m.date?.slice(5) ?? '-'}</td>
                  <td className={`${m.homeTeamId === league.targetTeamId ? 'target-text' : ''} ${isHomeWin ? 'result-winner' : isAwayWin ? 'result-loser' : ''}`}>
                    {getTeamName(teams, m.homeTeamId, lang)}
                  </td>
                  <td className="score-cell">
                    <span className={`score ${isHomeWin ? 'winner' : ''}`}>{m.homeScore}</span>
                    <span className="score-sep">-</span>
                    <span className={`score ${isAwayWin ? 'winner' : ''}`}>{m.awayScore}</span>
                  </td>
                  <td className={`${m.awayTeamId === league.targetTeamId ? 'target-text' : ''} ${isAwayWin ? 'result-winner' : isHomeWin ? 'result-loser' : ''}`}>
                    {getTeamName(teams, m.awayTeamId, lang)}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-field note-input"
                      style={{ fontSize: 10 }}
                      value={matchNotes[m.id] ?? ''}
                      onChange={(e) => setMatchNote(m.id, e.target.value)}
                      placeholder={t('Add a note...')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
          ) },
        ]}
      />
    </div>
  );
}
