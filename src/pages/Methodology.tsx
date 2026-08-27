import { useI18n } from '../i18n/I18nContext.tsx';
import { useData } from '../hooks/useData';
import { getTeamName } from '../utils/helpers';

export default function Methodology() {
  const { t, lang } = useI18n();
  const { teams, strengths, predictions, league, simulationConfig } = useData();

  // Live worked example: prefer the target team's next predicted match, else just the first one.
  const example = predictions.find(
    (p) => p.homeTeamId === league.targetTeamId || p.awayTeamId === league.targetTeamId
  ) ?? predictions[0];
  const homeStr = example ? strengths.get(example.homeTeamId) : undefined;
  const awayStr = example ? strengths.get(example.awayTeamId) : undefined;
  const w = simulationConfig.formWeighting;
  const blend = (base: number, form: number) => base * (1 - w) + form * w;
  const homeAttackBlend = homeStr ? blend(homeStr.attack, homeStr.formRating) : 0;
  const awayDefenseBlend = awayStr ? blend(awayStr.defense, awayStr.formRating) : 0;
  const awayAttackBlend = awayStr ? blend(awayStr.attack, awayStr.formRating) : 0;
  const homeDefenseBlend = homeStr ? blend(homeStr.defense, homeStr.formRating) : 0;
  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="page">
      <h2>{t('METHODOLOGY')}</h2>

      <div className="panel full-width">
        <h3>{t('WHAT THIS SITE COMPUTES')}</h3>
        <p className="path-description">
          {t('Every probability on this site (title chances, projected final standings, match win/draw/loss odds) comes from a Monte Carlo simulation of the rest of the season, driven by a team-strength model fit to this season\'s actual results. Nothing here is copied from another source — it is computed from the match scores in the Data tab.')}
        </p>
      </div>

      <div className="panel full-width">
        <h3>{t('1. TEAM STRENGTH RATING')}</h3>
        <p className="path-description">
          {t('Each team gets five ratings — overall, attack, defense, home-specific, away-specific — starting from a neutral baseline of 1000 and updated after every completed match with an Elo-style update:')}
        </p>
        <pre className="mono debug-block">
{`rating' = rating + K × (actual − expected)
expected_home = 1 / (1 + 10^(-(rating_home + HOME_ADVANTAGE − rating_away) / 400))
actual = 1 (win) / 0.5 (draw) / 0 (loss)

attack'  = attack  + K × 0.4 × (goalsFor / leagueAvgGoals − expected)
defense' = defense + K × 0.3 × (expectedAgainst − goalsAgainst / leagueAvgGoals)
home'    = home    + K × 0.5 × (actual_home − expected_home)   [only on that team's home matches]
away'    = away    + K × 0.5 × (actual_away − expected_away)   [only on that team's away matches]`}
        </pre>
        <table className="dense-table">
          <thead><tr><th>{t('Constant')}</th><th>{t('Value')}</th></tr></thead>
          <tbody>
            <tr><td>BASE_RATING</td><td>1000</td></tr>
            <tr><td>K_FACTOR (K)</td><td>32</td></tr>
            <tr><td>HOME_ADVANTAGE</td><td>60 {t('rating points')}</td></tr>
            <tr><td>REGRESSION_PRIOR_GAMES</td><td>4</td></tr>
          </tbody>
        </table>
        <p className="path-description">
          {t('Displayed rating = (raw − 700) / 600 × 100, so raw 1000 (neutral) shows as 50, and the scale roughly spans 0-100.')}
        </p>
        <p className="path-description">
          {t('Small-sample correction (empirical-Bayes shrinkage): displayed = 1000 + (raw − 1000) × games / (games + 4). At 0 games that\'s fully clamped to neutral (1000→50); at 4 games a team is pulled halfway back to neutral; by ~16 games the pull is under 20%. Home and away ratings shrink using that venue\'s own game count specifically, not total games played.')}
        </p>
        <p className="path-description">
          {t('Uncertainty (shown per team) is a step function of games played: 20 below 5 games, 12 below 10, 7 below 15, 3 at 15+.')}
        </p>
      </div>

      <div className="panel full-width">
        <h3>{t('2. MATCH PREDICTION')}</h3>
        <pre className="mono debug-block">
{`homeAttack  = homeStr.attack  × (1 − formWeight) + homeStr.formRating × formWeight
awayDefense = awayStr.defense × (1 − formWeight) + awayStr.formRating × formWeight
homeVenueFactor = homeAwayAdjustment ? homeStr.homeStrength / 50 : 1
avgHomeGoals    = homeAwayAdjustment ? (this season's real home-goal average) : (home+away average)

expectedHomeGoals = max(0.1, (homeAttack / 50) × avgHomeGoals × homeVenueFactor
                              × (1 − (awayDefense − 50) / 200))
[expectedAwayGoals is the mirror: awayAttack, homeDefense, awayVenueFactor, avgAwayGoals]

P(home=h, away=a) = Poisson(h; expectedHomeGoals) × Poisson(a; expectedAwayGoals) × τ(h,a)
τ(0,0) = 1 − λμρ   τ(0,1) = 1 + λρ   τ(1,0) = 1 + μρ   τ(1,1) = 1 − ρ   τ(else) = 1`}
        </pre>
        <table className="dense-table">
          <thead><tr><th>{t('Constant')}</th><th>{t('Value')}</th></tr></thead>
          <tbody>
            <tr><td>MAX_GOALS {t('(scoreline grid cutoff)')}</td><td>8 {t('per side')}</td></tr>
            <tr><td>DIXON_COLES_RHO (ρ)</td><td>-0.13</td></tr>
            <tr><td>{t('Fallback goal averages (no completed matches yet)')}</td><td>1.5 {t('home')} / 1.15 {t('away')}</td></tr>
          </tbody>
        </table>

        {example && homeStr && awayStr ? (
          <>
            <p className="path-description">
              <strong>{t('Live worked example')}</strong> — {getTeamName(teams, example.homeTeamId, lang)} {t('vs')} {getTeamName(teams, example.awayTeamId, lang)} ({t('current data, formWeighting')} = {w}):
            </p>
            <table className="dense-table">
              <thead><tr><th></th><th>{t('Overall')}</th><th>{t('Attack')}</th><th>{t('Defense')}</th><th>{t('Home/Away split')}</th><th>{t('Form')}</th></tr></thead>
              <tbody>
                <tr>
                  <td>{getTeamName(teams, example.homeTeamId, lang)} ({t('Home')})</td>
                  <td>{fmt(homeStr.overall)}</td><td>{fmt(homeStr.attack)}</td><td>{fmt(homeStr.defense)}</td>
                  <td>{fmt(homeStr.homeStrength)}</td><td>{fmt(homeStr.formRating)}</td>
                </tr>
                <tr>
                  <td>{getTeamName(teams, example.awayTeamId, lang)} ({t('Away')})</td>
                  <td>{fmt(awayStr.overall)}</td><td>{fmt(awayStr.attack)}</td><td>{fmt(awayStr.defense)}</td>
                  <td>{fmt(awayStr.awayStrength)}</td><td>{fmt(awayStr.formRating)}</td>
                </tr>
              </tbody>
            </table>
            <pre className="mono debug-block">
{`homeAttack  = ${fmt(homeStr.attack)} × ${(1 - w).toFixed(2)} + ${fmt(homeStr.formRating)} × ${w.toFixed(2)} = ${fmt(homeAttackBlend)}
awayDefense = ${fmt(awayStr.defense)} × ${(1 - w).toFixed(2)} + ${fmt(awayStr.formRating)} × ${w.toFixed(2)} = ${fmt(awayDefenseBlend)}
awayAttack  = ${fmt(awayStr.attack)} × ${(1 - w).toFixed(2)} + ${fmt(awayStr.formRating)} × ${w.toFixed(2)} = ${fmt(awayAttackBlend)}
homeDefense = ${fmt(homeStr.defense)} × ${(1 - w).toFixed(2)} + ${fmt(homeStr.formRating)} × ${w.toFixed(2)} = ${fmt(homeDefenseBlend)}

expectedHomeGoals = ${fmt(example.expectedHomeGoals)}
expectedAwayGoals = ${fmt(example.expectedAwayGoals)}

P(home win) = ${(example.homeWinProb * 100).toFixed(1)}%
P(draw)     = ${(example.drawProb * 100).toFixed(1)}%
P(away win) = ${(example.awayWinProb * 100).toFixed(1)}%`}
            </pre>
          </>
        ) : (
          <p className="no-data">{t('No scheduled match available for a live example right now.')}</p>
        )}
      </div>

      <div className="panel full-width">
        <h3>{t('3. SEASON SIMULATION')}</h3>
        <p className="path-description">
          {t('Starting from the real current standings, the simulator plays out every remaining scheduled match repeatedly with a seeded random number generator (mulberry32). For each run and each remaining match: a uniform random draw picks win/draw/loss according to that match\'s predicted probabilities, then the actual scoreline is sampled from a fixed goal-count distribution conditioned on that outcome (not from the Poisson grid directly — this second step only decides how many goals the winning/losing margin is, not the outcome itself):')}
        </p>
        <pre className="mono debug-block">
{`if outcome = home win:  winnerGoals ~ {1:0.40, 2:0.35, 3:0.15, 4:0.10}, loserGoals ~ {0:0.50, 1:0.35, 2:0.15}, clipped below winnerGoals
if outcome = draw:      bothGoals   ~ {0:0.25, 1:0.40, 2:0.25, 3:0.10}
if outcome = away win:  mirror of home win`}
        </pre>
        <p className="path-description">
          {t('Every simulated run recomputes final standings with the same points/tiebreaker rules as the real table. Title probability = (# runs where the target finishes 1st) / (total runs). Position probabilities, expected final points, and expected goal difference are the same kind of average across all runs.')}
        </p>
        <table className="dense-table">
          <thead><tr><th>{t('Setting')}</th><th>{t('Current value')}</th></tr></thead>
          <tbody>
            <tr><td>{t('Simulation count (this session)')}</td><td>{simulationConfig.count.toLocaleString()}</td></tr>
            <tr><td>{t('Random seed (this session)')}</td><td>{simulationConfig.seed}</td></tr>
            <tr><td>{t('Default simulation count')}</td><td>10,000</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel full-width">
        <h3>{t('4. FINAL STANDINGS RULES')}</h3>
        <p className="path-description">
          {t('This league\'s actual configured rules (from the Data tab):')}
        </p>
        <table className="dense-table">
          <thead><tr><th>{t('Rule')}</th><th>{t('Value')}</th></tr></thead>
          <tbody>
            <tr><td>{t('Win / Draw / Loss points')}</td><td>{league.rules.winPoints} / {league.rules.drawPoints} / {league.rules.lossPoints}</td></tr>
            <tr><td>{t('Tiebreaker order')}</td><td>{league.rules.tiebreakers.map((tb, i) => `${i + 1}. ${tb.type.replace(/_/g, ' ')}`).join(' → ')}</td></tr>
          </tbody>
        </table>
        <p className="path-description">
          {t('The engine also supports head-to-head points/goal-difference/goals-scored tiebreakers — they only apply if this league\'s rules above actually list them.')}
        </p>
      </div>

      <div className="panel full-width">
        <h3>{t('CONFIGURABLE ASSUMPTIONS')}</h3>
        <table className="dense-table">
          <thead>
            <tr>
              <th>{t('Setting')}</th>
              <th>{t('What it changes')}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>{t('Assumptions (Status Quo / Recent Form / Long Term / Mean Reversion / Hot Form / Cold Form)')}</td><td>{t('How much a team\'s recent form (vs its season-long rating) drives its simulated strength, and whether ratings are pulled toward or pushed away from average.')}</td></tr>
            <tr><td>{t('Form Weight')}</td><td>{t('How much recent form (last 5 games) is blended into attack/defense ratings when predicting a match.')}</td></tr>
            <tr><td>{t('Home/Away Tendency')}</td><td>{t('Whether home-field advantage and each team\'s own home/away performance split are applied at all — off treats every match as a neutral venue.')}</td></tr>
            <tr><td>{t('Second Leg (Return Fixtures)')}</td><td>{t('This league is a home-and-away double round-robin, but only the first-leg fixtures are officially published. Turning this on projects the certain-to-happen return fixtures (same pairings, venue swapped) so the title race is modeled over the full season instead of stopping at the last published round.')}</td></tr>
            <tr><td>{t('Travel Fatigue')}</td><td>{t('Suppresses the away team\'s expected goals (and slightly boosts the home side\'s) based on the great-circle distance between the two teams\' home grounds, up to a 10% swing at 200km+. Needs both teams to have venue coordinates on file.')}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel full-width">
        <h3>{t('KNOWN LIMITATIONS')}</h3>
        <p className="path-description">
          {t('This is a transparent statistical model, not a validated forecasting tool — read the numbers accordingly:')}
        </p>
        <ul className="path-description" style={{ paddingLeft: 18 }}>
          <li>{t('Small sample: only a handful of rounds have been played, so every rating carries real uncertainty. The shrinkage correction softens this but can\'t remove it — early-season numbers should be read as rough, not precise.')}</li>
          <li>{t('Untuned constants: the attack/defense update weights, the Dixon-Coles correlation value, and the form-blend weight are reasonable literature-typical values, not fitted to this specific league\'s data (there isn\'t enough of it yet to fit against).')}</li>
          <li>{t('No external factors: injuries, suspensions, transfers, weather, and travel are not modeled at all — only match scores.')}</li>
          <li>{t('Backtested accuracy is limited so far: the BACKTEST tab walk-forward tests every round against real results, but with only a handful of rounds played the model does not yet reliably beat a naive baseline. Treat probabilities as directionally meaningful, not precise, until that changes.')}</li>
          <li>{t('Second-leg projection is a placeholder: those fixtures are not officially scheduled yet, so exact rounds/dates will differ once published — only the pairings (who plays whom at which venue) are treated as certain.')}</li>
        </ul>
      </div>
    </div>
  );
}
