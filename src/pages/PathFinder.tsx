import { useMemo } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName, slugify } from '../utils/helpers';
import { findPaths } from '../engine/pathfinder';
import { useI18n } from '../i18n/I18nContext.tsx';
import { HoverInfo } from '../components/HoverInfo';
import { SectionTabs } from '../components/SectionTabs';
import { interpretControlIndex } from '../utils/interpret.ts';

export default function PathFinder() {
  const { league, teams, standings, matches, strengths, simulation, simulationConfig } = useData();
  const { t, lang } = useI18n();

  const pathResult = useMemo(() => {
    if (!simulation) return null;
    return findPaths(league, teams, standings, matches, strengths, simulationConfig);
  }, [league, teams, standings, matches, strengths, simulation]);

  if (!pathResult) {
    return <div className="page"><h2>{t('PATH FINDER')}</h2><p>{t('Loading...')}</p></div>;
  }

  const targetStanding = standings.find((s) => s.teamId === league.targetTeamId);
  const topStanding = standings[0];

  return (
    <div className="page">
      <h2>{t('PATH FINDER')}</h2>

      <SectionTabs
        sections={[
          { id: 'status', label: t('STATUS'), content: (<>
      <div className="pathfinder-summary">
        <div className="panel">
          <h3>{t('POSITION SUMMARY')}</h3>
          <div className="stat-row">
            <span className="stat-label">{t('Current Position')}</span>
            <span className="stat-value big">{targetStanding?.position ?? '-'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Points')}</span>
            <span className="stat-value">{targetStanding?.points ?? 0}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Gap to 1st')}</span>
            <span className="stat-value">{topStanding ? topStanding.points - (targetStanding?.points ?? 0) : 0}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Games Remaining')}</span>
            <span className="stat-value">{targetStanding?.gamesRemaining ?? 0}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Max Possible Pts')}</span>
            <span className="stat-value">{targetStanding?.maxPossiblePoints ?? 0}</span>
          </div>
        </div>

        <div className="panel">
          <h3>{t('TITLE STATUS')}</h3>
          <div className="title-status-display">
            <div className={`status-badge status-${pathResult.titleStatus.code.toLowerCase()}`}>
              {t(pathResult.titleStatus.label)}
            </div>
            <div className="status-desc">{pathResult.titleStatus.description}</div>
            {pathResult.titleStatus.isMathematical && (
              <div className="mathematical-note">★ {t('Mathematical certainty')}</div>
            )}
          </div>
          <div className="stat-row">
            <span className="stat-label"><HoverInfo text={t('How much of the title race is in this team\'s own hands vs depending on other teams\' results — 100% means winning out settles it alone.')}>{t('Control Index')}</HoverInfo></span>
            <HoverInfo text={interpretControlIndex(pathResult.controlIndex.overall, lang)}>
              <span className="stat-value">{pathResult.controlIndex.overall}%</span>
            </HoverInfo>
          </div>
          <div className="stat-row">
            <span className="stat-label"><HoverInfo text={t('Share of the title outcome decided purely by this team\'s own remaining results.')}>{t('Own Results')}</HoverInfo></span>
            <span className="stat-value">{pathResult.controlIndex.ownResults}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label"><HoverInfo text={t('Share of the title outcome that depends on rival teams\' results going the right way.')}>{t('Rival Dependence')}</HoverInfo></span>
            <span className="stat-value">{pathResult.controlIndex.rivalDependence}%</span>
          </div>
        </div>

        <div className="panel">
          <h3>{t('MINIMUM REQUIREMENTS')}</h3>
          <div className="stat-row">
            <span className="stat-label">{t('Points Needed')}</span>
            <span className="stat-value big">{pathResult.minimumPointsNeeded}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{t('Condition')}</span>
            <span className="stat-value small">{pathResult.mathematicalClimbCondition}</span>
          </div>
          {pathResult.clinchEarliestRound && (
            <div className="stat-row">
              <span className="stat-label">{t('Earliest Clinch')}</span>
              <span className="stat-value accent">{t('Round')} {pathResult.clinchEarliestRound}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pathfinder-paths">
        {/* Easiest Path */}
        <div className="panel">
          <h3>{t('EASIEST PATH')}</h3>
          <div className="path-description">
            {t('A path that considers opponent strength and minimizes required burden.')}
          </div>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Round')}</th>
                <th>{t('Opponent')}</th>
                <th>{t('Venue')}</th>
                <th>{t('Requirement')}</th>
                <th>{t('Pts Needed')}</th>
              </tr>
            </thead>
            <tbody>
              {pathResult.easiestPath.map((step) => (
                <tr key={step.matchId}>
                  <td>R{step.round}</td>
                  <td>{step.opponent}</td>
                  <td>{step.isHome ? t('HOME') : t('AWAY')}</td>
                  <td>
                    <span className={`req-badge req-${slugify(step.requirement)}`}>
                      {t(step.requirement)}
                    </span>
                  </td>
                  <td>{step.requiredPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Safest Path */}
        <div className="panel">
          <h3>{t('SAFEST PATH')}</h3>
          <div className="path-description">
            {t('A path that minimizes reliance on rival mistakes and fragile conditions.')}
          </div>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Round')}</th>
                <th>{t('Opponent')}</th>
                <th>{t('Venue')}</th>
                <th>{t('Requirement')}</th>
                <th>{t('Pts Needed')}</th>
              </tr>
            </thead>
            <tbody>
              {pathResult.safestPath.map((step) => (
                <tr key={step.matchId}>
                  <td>R{step.round}</td>
                  <td>{step.opponent}</td>
                  <td>{step.isHome ? t('HOME') : t('AWAY')}</td>
                  <td>
                    <span className={`req-badge req-${slugify(step.requirement)}`}>
                      {t(step.requirement)}
                    </span>
                  </td>
                  <td>{step.requiredPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>) },
          { id: 'mustwin', label: t('MUST-WIN ANALYSIS'), content: (<>
      {/* MUST-WIN Analysis */}
      <div className="panel full-width">
        <h3>{t('MUST-WIN ANALYSIS')}</h3>
        <div className="mustwin-list">
          {pathResult.mustWinMatches.map((mw) => {
            const match = matches.find((m) => m.id === mw.matchId);
            if (!match) return null;
            return (
              <div key={mw.matchId} className={`mustwin-card mustwin-${mw.classification.toLowerCase().replace('_', '-')}`}>
                <div className="mustwin-header">
                  <span className="mustwin-round">R{mw.round}</span>
                  <span className={`badge badge-${mw.classification.toLowerCase().replace('_', '-')}`}>
                    {t(mw.classification)}
                  </span>
                </div>
                <div className="mustwin-match">
                  {getTeamName(teams, mw.homeTeamId, lang)} vs {getTeamName(teams, mw.awayTeamId, lang)}
                </div>
                <div className="mustwin-reasons">
                  {mw.reasons.map((r, i) => (
                    <div key={i} className="reason">{r}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rival Dependencies */}
      {pathResult.rivalDependencies.length > 0 && (
        <div className="panel full-width">
          <h3>{t('RIVAL DEPENDENCIES')}</h3>
          <table className="dense-table">
            <thead>
              <tr>
                <th>{t('Rival')}</th>
                <th>{t('Dependency Level')}</th>
                <th>{t('Info')}</th>
              </tr>
            </thead>
            <tbody>
              {pathResult.rivalDependencies.map((rd) => (
                <tr key={rd.rivalId}>
                  <td>{rd.rivalName}</td>
                  <td>
                    <div className="dependency-bar">
                      <div
                        className="dependency-fill"
                        style={{ width: `${rd.dependencyLevel}%` }}
                      />
                      <span>{rd.dependencyLevel}%</span>
                    </div>
                  </td>
                  <td>{rd.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>) },
        ]}
      />
    </div>
  );
}
