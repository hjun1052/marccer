import { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';
import { runBacktest } from '../engine/backtest.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export default function Backtest() {
  const { league, teams, matches, simulationConfig } = useData();
  const { t, lang } = useI18n();

  const maxStartRound = Math.max(1, ...matches.filter((m) => m.status === 'completed').map((m) => m.round));
  const [startRound, setStartRound] = useState(Math.min(3, maxStartRound));

  const result = useMemo(
    () => runBacktest(league, teams, matches, simulationConfig, startRound),
    [league, teams, matches, simulationConfig, startRound]
  );

  const beatBaseline = result.overall.matches > 0 && result.overall.avgBrierScore < result.overall.naiveBaselineBrierScore;

  return (
    <div className="page">
      <h2>{t('BACKTEST')}</h2>

      <div className="panel full-width" style={{ borderColor: 'var(--red)' }}>
        <h3 style={{ color: 'var(--red)' }}>⚠ {t('IN PLAIN TERMS')}</h3>
        {result.overall.matches === 0 ? (
          <p className="path-description" style={{ fontSize: 12 }}>
            {t('Not enough finished matches yet to grade the predictions. Come back after a few more rounds.')}
          </p>
        ) : (
          <p className="path-description" style={{ fontSize: 12 }}>
            {t('This page grades our own predictions against what actually happened.')}{' '}
            {beatBaseline
              ? t('So far the model beats just guessing this league\'s average results — a real (if early) signal that it\'s picking up something.')
              : t('So far the model does NOT beat just guessing this league\'s average results — it is not yet reliable. Treat every probability on this site as a rough guess, not a real forecast, until this page shows otherwise.')}
            {' '}{t('This is based on only')} {result.overall.matches} {t('graded matches so far — too few to trust either way. Check back as more rounds are played.')}
          </p>
        )}
      </div>

      <div className="panel full-width">
        <h3>{t('WALK-FORWARD ACCURACY CHECK')}</h3>
        <p className="path-description">
          {t('For each round, team strengths are trained only on matches from strictly before that round, then used to predict that round\'s matches — the model never sees a round\'s own results (or later ones) before predicting it. This measures how well-calibrated the model has actually been this season, using only match results already in the Data tab. It does not need future data.')}
        </p>
        <div className="round-filter">
          {Array.from({ length: maxStartRound }, (_, i) => i + 1).map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${startRound === r ? 'active' : ''}`}
              onClick={() => setStartRound(r)}
            >
              R{r}+
            </button>
          ))}
        </div>
        <div className="scenario-instructions">
          {t('Starting from round')} {startRound} — {t('rounds before this have too little training data to be a fair test (predicting off 0-2 games of history is close to a coin flip regardless of model quality).')}
        </div>
      </div>

      {result.overall.matches === 0 ? (
        <div className="panel full-width"><div className="no-data">{t('Not enough completed matches yet to backtest from this round.')}</div></div>
      ) : (
        <>
          <div className="overview-grid">
            <div className="panel">
              <h3>{t('OVERALL')}</h3>
              <div className="stat-row">
                <span className="stat-label">{t('Matches tested')}</span>
                <span className="stat-value big">{result.overall.matches}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('Accuracy (top pick correct)')}</span>
                <span className="stat-value accent">{(result.overall.accuracy * 100).toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('Avg Brier score (lower = better, 0 = perfect)')}</span>
                <span className="stat-value">{result.overall.avgBrierScore.toFixed(3)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('Naive baseline Brier score')}</span>
                <span className="stat-value">{result.overall.naiveBaselineBrierScore.toFixed(3)}</span>
              </div>
              <div className="stat-divider"></div>
              <div className={`mathematical-note ${beatBaseline ? '' : ''}`} style={{ color: beatBaseline ? 'var(--green)' : 'var(--red)' }}>
                {beatBaseline
                  ? t('Beats the naive baseline — the model is adding real signal over just guessing this league\'s average W/D/L rates.')
                  : t('Does not beat the naive baseline yet — with this little data, guessing the league\'s average W/D/L rates does about as well or better. Read all probabilities on this site accordingly.')}
              </div>
            </div>

            <div className="panel">
              <h3>{t('WHAT "NAIVE BASELINE" MEANS')}</h3>
              <p className="path-description">
                {t('Instead of the full model, the naive baseline always predicts this league\'s actual overall win/draw/loss rates (not 33/33/33 — home advantage alone beats a uniform guess). If the model can\'t beat this simple bar, its extra machinery (ratings, Poisson, Dixon-Coles) isn\'t earning its keep yet — usually because there isn\'t enough data to tell teams apart reliably.')}
              </p>
            </div>
          </div>

          <div className="panel full-width">
            <h3>{t('BY ROUND')}</h3>
            <table className="dense-table">
              <thead>
                <tr>
                  <th>{t('Round')}</th>
                  <th>{t('Matches')}</th>
                  <th>{t('Accuracy')}</th>
                  <th>{t('Avg Brier')}</th>
                </tr>
              </thead>
              <tbody>
                {result.roundSummaries.map((r) => (
                  <tr key={r.round}>
                    <td>R{r.round}</td>
                    <td>{r.matches}</td>
                    <td className={r.accuracy >= 0.5 ? 'positive' : 'negative'}>{(r.accuracy * 100).toFixed(0)}%</td>
                    <td>{r.avgBrierScore.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel full-width">
            <h3>{t('MATCH-BY-MATCH')}</h3>
            <table className="dense-table">
              <thead>
                <tr>
                  <th>{t('R')}</th>
                  <th>{t('Match')}</th>
                  <th>{t('Predicted')}</th>
                  <th>{t('Actual')}</th>
                  <th>{t('Brier')}</th>
                </tr>
              </thead>
              <tbody>
                {result.matchResults.map((m) => (
                  <tr key={m.matchId} className={m.predictedCorrectly ? '' : 'negative'}>
                    <td>R{m.round}</td>
                    <td>{getTeamName(teams, m.homeTeamId, lang)} vs {getTeamName(teams, m.awayTeamId, lang)}</td>
                    <td>{(m.homeWinProb * 100).toFixed(0)}/{(m.drawProb * 100).toFixed(0)}/{(m.awayWinProb * 100).toFixed(0)}</td>
                    <td>{m.actual}</td>
                    <td>{m.brierScore.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
