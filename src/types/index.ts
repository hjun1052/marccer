// ============================================================
// CORE TYPES - League Race Analyzer
// ============================================================

// --- Source Data Types ---

export type MatchStatus = 'scheduled' | 'completed' | 'postponed' | 'cancelled';

export interface League {
  id: string;
  name: string;
  nameEn?: string;
  seasonId: string;
  seasonName: string;
  seasonNameEn?: string;
  teamIds: string[];
  currentRound: number;
  totalRounds: number;
  teamsPerRound: number;
  rules: LeagueRules;
  targetTeamId: string;
  dataVersion: string;
  modelVersion: string;
  lastDataUpdate: string;
}

export interface LeagueRules {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tiebreakers: TiebreakerRule[];
}

export type TiebreakerType =
  | 'goal_difference'
  | 'goals_scored'
  | 'head_to_head_points'
  | 'head_to_head_goal_difference'
  | 'head_to_head_goals_scored';

export interface TiebreakerRule {
  type: TiebreakerType;
  priority: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  displayName: string;
  nameEn?: string;
  shortNameEn?: string;
  displayNameEn?: string;
  venue?: {
    nameKo: string;
    nameEn: string;
    lat: number;
    lng: number;
  };
}

export interface Match {
  id: string;
  seasonId: string;
  round: number;
  date: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  notes: string;
}

// --- Derived Types ---

export interface TeamStanding {
  teamId: string;
  position: number;
  previousPosition: number | null;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  gamesRemaining: number;
  maxPossiblePoints: number;
  minPossibleFinalPoints: number;
  pointsGapToFirst: number;
  pointsGapToTarget: number;
  positionChange: number | null;
  form: FormRecord;
  // Of the rounds that have actually happened so far (any match completed or
  // postponed), how many this team had no fixture at all (odd team count ->
  // one team sits out each round) vs how many were scheduled but postponed.
  // Both explain a "-N" games-in-hand gap without it always meaning "unplayed".
  byeRounds: number;
  postponedRounds: number;
  // Round already has other results in, but this team's own match within it
  // is still just a normal, not-yet-played fixture (not postponed, not a bye).
  stillScheduledRounds: number;
}

export interface FormRecord {
  last3: ResultType[];
  last5: ResultType[];
  last10: ResultType[];
  points: number;
}

export type ResultType = 'W' | 'D' | 'L';

export interface TeamStrength {
  teamId: string;
  overall: number;
  attack: number;
  defense: number;
  homeStrength: number;
  awayStrength: number;
  formRating: number;
  uncertainty: number;
  scheduleDifficulty: number;
  ratingHistory: number[];
  gamesAnalyzed: number;
  vsTopTeams: StrengthRecord;
  vsMiddleTeams: StrengthRecord;
  vsBottomTeams: StrengthRecord;
}

export interface StrengthRecord {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface MatchPrediction {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  matchDifficulty: number;
  predictionConfidence: number;
  modelVersion: string;
}

// --- Season Simulation ---

export interface SimulationConfig {
  count: number;
  seed: number;
  assumptions: ForecastAssumption;
  formWeighting: number;
  // Whether predictions factor in home-field advantage and each team's own
  // home/away split (homeStrength/awayStrength). Off = treat every match as neutral-venue.
  homeAwayAdjustment: boolean;
  // The league is a home-and-away double round-robin, but only the first leg's
  // fixtures are published. On = project synthetic return-leg matches (same
  // pairings, venue swapped) so simulations cover the full season, not just
  // the last published round.
  includeSecondLeg: boolean;
  // Suppresses the away team's expected goals a little (and boosts the home
  // side's a little) based on great-circle distance between the two teams'
  // home grounds — a travel-fatigue effect. Needs venue coordinates on both
  // teams; matches without them are unaffected.
  travelFatigue: boolean;

  // --- Model weights (advanced) ---
  // These drive the rating/prediction math directly. Defaults match the
  // values the engine used before this was made configurable — change them
  // only if you know what you're adjusting (see the MODEL WEIGHTS tab).
  kFactor: number; // Elo update speed for the overall rating.
  homeAdvantage: number; // Elo rating-point bonus given to the home side.
  attackWeight: number; // How fast attack rating reacts to goals scored, relative to kFactor.
  defenseWeight: number; // How fast defense rating reacts to goals conceded, relative to kFactor.
  venueWeight: number; // How fast home/away-specific rating reacts, relative to kFactor.
  regressionPriorGames: number; // "Prior games" of neutral evidence a new team's rating starts with (shrinkage).
  dixonColesRho: number; // Low-score correlation correction for the Poisson scoreline grid.
  travelFatigueReferenceKm: number; // Distance at which travel fatigue reaches its max penalty.
  travelFatigueMaxPenalty: number; // Max fraction the away side's expected goals are reduced by.
}

export type ForecastAssumption =
  | 'status_quo'
  | 'recent_form'
  | 'long_term'
  | 'mean_reversion'
  | 'hot_form'
  | 'cold_form';

export interface SimulationResult {
  teamId: string;
  positionProbabilities: Record<number, number>;
  titleProbability: number;
  top2Probability: number;
  top4Probability: number;
  avgFinishingPosition: number;
  expectedFinalPoints: number;
  expectedFinalGD: number;
  minPosition: number;
  maxPosition: number;
}

export interface SimulationOutput {
  config: SimulationConfig;
  results: SimulationResult[];
  targetTeamTitleProb: number;
  targetTeamTitleProbability: number;
  criticalMatches: CriticalMatch[];
  generatedAt: string;
}

// --- Scenario / What-If ---

export interface MatchOverride {
  matchId: string;
  homeScore: number;
  awayScore: number;
  locked: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  baseState: string;
  parentId: string | null;
  overrides: MatchOverride[];
  createdAt: string;
}

export interface ScenarioState {
  scenario: Scenario;
  standings: TeamStanding[];
  matchPredictions: MatchPrediction[];
  teamStrengths: TeamStrength[];
  titleProbabilities: Record<string, number>;
  targetTeamTitleProb: number;
  finalPositionDistribution: Record<number, number>;
  criticalMatches: CriticalMatch[];
  mustWinAnalysis: MustWinMatch[];
  pathAnalysis: PathAnalysis;
  controlIndex: ControlIndex;
  titleStatus: TitleStatus;
}

// --- Path Analysis ---

export type MatchClassification =
  | 'MUST_WIN'
  | 'WIN_PREFERRED'
  | 'DRAW_ACCEPTABLE'
  | 'DONT_LOSE'
  | 'LOW_IMPACT';

export interface MustWinMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  round: number;
  classification: MatchClassification;
  reasons: string[];
  titleProbBeforeWin: number;
  titleProbBeforeDraw: number;
  titleProbBeforeLoss: number;
}

export interface PathStep {
  matchId: string;
  round: number;
  opponent: string;
  isHome: boolean;
  requirement: string;
  requiredPoints: number;
}

export interface PathAnalysis {
  easiestPath: PathStep[];
  safestPath: PathStep[];
  requiredWins: number;
  allowedDraws: number;
  allowedLosses: number;
  requiredPoints: number;
  rivalDependencies: RivalDependency[];
  confidence: number;
}

export interface RivalDependency {
  rivalId: string;
  rivalName: string;
  dependencyLevel: number;
  description: string;
}

// --- Critical Matches ---

export interface CriticalMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  round: number;
  impactScore: number;
  titleImpact: number;
  classification: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'IRRELEVANT';
  titleProbIfHomeWin: number;
  titleProbIfDraw: number;
  titleProbIfAwayWin: number;
  explanation: string;
}

// --- Control Index ---

export interface ControlIndex {
  overall: number;
  ownResults: number;
  rivalDependence: number;
}

// --- Title Status ---

export type TitleStatusCode =
  | 'ELIMINATED'
  | 'POSSIBLE'
  | 'IN_CONTROL'
  | 'PARTIAL_CONTROL'
  | 'FAVORITE'
  | 'CLINCHED';

export interface TitleStatus {
  code: TitleStatusCode;
  label: string;
  isMathematical: boolean;
  probability: number;
  description: string;
}

// --- Match Historical Context ---

export interface MatchContext {
  matchId: string;
  homePositionBefore: number;
  awayPositionBefore: number;
  homePointsBefore: number;
  awayPointsBefore: number;
  homeRecordBefore: { wins: number; draws: number; losses: number };
  awayRecordBefore: { wins: number; draws: number; losses: number };
  homeGDBefore: number;
  awayGDBefore: number;
  homeFormBefore: ResultType[];
  awayFormBefore: ResultType[];
  homePositionAfter: number;
  awayPositionAfter: number;
  homePointsAfter: number;
  awayPointsAfter: number;
  isUpset: boolean;
  upsetScore: number;
}

// --- Team Strength Explanation ---

export interface TeamStrengthExplanation {
  teamId: string;
  overall: number;
  factors: {
    label: string;
    value: number;
    weight: number;
    explanation: string;
  }[];
}

// --- Schedule Analysis ---

export interface ScheduleAnalysis {
  teamId: string;
  avgOpponentStrength: number;
  hardestRemaining: string;
  easiestRemaining: string;
  strongOpponentCount: number;
  consecutiveDifficult: number;
  homeRemaining: number;
  awayRemaining: number;
}

// --- Post-Match Analysis ---

export interface PostMatchAnalysis {
  matchId: string;
  titleProbBefore: number;
  titleProbAfter: number;
  titleProbChange: number;
  rankingMovement: number;
  pointGapChange: number;
  gdChange: number;
  newCriticalMatches: CriticalMatch[];
  newMustWinMatches: MustWinMatch[];
  newEasiestPath: PathStep[];
  newSafestPath: PathStep[];
  contributors: {
    label: string;
    change: number;
    explanation: string;
  }[];
}

// --- Prediction vs Reality ---

export interface PredictionRecord {
  matchId: string;
  predictedHomeWinProb: number;
  predictedDrawProb: number;
  predictedAwayWinProb: number;
  predictedTopOutcome: ResultType;
  actualResult: ResultType | null;
  wasCorrect: boolean | null;
  modelVersion: string;
  recordedAt: string;
}

// --- App State ---

export interface AppState {
  league: League;
  teams: Team[];
  matches: Match[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  simulationConfig: SimulationConfig;
}

// --- API / Data loading ---

export interface DataBundle {
  league: League;
  teams: Team[];
  matches: Match[];
}

// --- Projection Assumptions Display ---

export interface ProjectionSummary {
  assumption: ForecastAssumption;
  label: string;
  description: string;
  targetTeamTitleProb: number;
  targetTeamTop2Prob: number;
}

// --- Helpers ---

export function createDefaultRules(): LeagueRules {
  return {
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    tiebreakers: [
      { type: 'goal_difference', priority: 1 },
      { type: 'goals_scored', priority: 2 },
      { type: 'head_to_head_points', priority: 3 },
    ],
  };
}

export function createDefaultSimulationConfig(): SimulationConfig {
  return {
    count: 10000,
    seed: 42,
    assumptions: 'status_quo',
    formWeighting: 0.3,
    homeAwayAdjustment: true,
    includeSecondLeg: true,
    travelFatigue: false,
    kFactor: 32,
    homeAdvantage: 60,
    attackWeight: 0.4,
    defenseWeight: 0.3,
    venueWeight: 0.5,
    regressionPriorGames: 4,
    dixonColesRho: -0.13,
    travelFatigueReferenceKm: 200,
    travelFatigueMaxPenalty: 0.1,
  };
}
