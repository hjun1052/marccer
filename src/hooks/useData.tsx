import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { League, Team, Match, Scenario, SimulationConfig, TeamStrength, MatchPrediction, TeamStanding } from '../types/index.ts';
import { createDefaultSimulationConfig } from '../types/index.ts';
import { calculateStandings } from '../engine/standings.ts';
import { calculateTeamStrengths } from '../engine/ratings.ts';
import { predictAllFutureMatches } from '../engine/predictions.ts';
import { simulateSeason } from '../engine/simulation.ts';
import { createScenario, addOverride, evaluateScenario } from '../engine/scenarios.ts';
import { findPaths, analyzeNextRoundRooting } from '../engine/pathfinder.ts';
import { withSecondLeg } from '../engine/secondLeg.ts';
import { snapshotAsOfRound, completedRoundsSoFar } from '../engine/titleTrend.ts';
import type { SimulationOutput, ScenarioState } from '../types/index.ts';
import type { PathFinderResult, RootingRecommendation } from '../engine/pathfinder.ts';
import {
  loadOverrideMatches,
  saveOverrideMatches,
  clearOverrideMatches,
  downloadMatchesSaveFile,
  parseMatchesSaveFile,
} from '../utils/dataOverride.ts';
import { loadScenarios, saveScenarios } from '../utils/scenarioStorage.ts';
import { loadMatchNotes, saveMatchNotes } from '../utils/matchNotes.ts';

// Import demo data
import leagueData from '../../data/league.json';
import teamsData from '../../data/teams.json';
import matchesData from '../../data/matches.json';

interface DataContextType {
  league: League;
  teams: Team[];
  matches: Match[];
  // The real, editable match data, ignoring the time machine view — use this
  // (not `matches`) for admin editing / export / anything that must not be
  // silently frozen at a past round.
  realMatches: Match[];
  // Projection-only league/matches: includes synthetic return-leg fixtures when
  // simulationConfig.includeSecondLeg is on. Use these (not the raw ones above)
  // for anything that projects the title race — standings and "next match"
  // lists should stay on the raw, officially-published data.
  projectionLeague: League;
  projectionMatches: Match[];
  standings: TeamStanding[];
  strengths: Map<string, TeamStrength>;
  predictions: MatchPrediction[];
  simulation: SimulationOutput | null;
  pathResult: PathFinderResult | null;
  rootingGuide: RootingRecommendation[];
  rootingRounds: number[];
  rootingRound: number | null;
  setRootingRound: (round: number | null) => void;
  scenarios: Scenario[];
  activeScenario: Scenario | null;
  activeScenarioState: ScenarioState | null;
  // A second scenario, evaluated the same way, so two scenarios can be compared
  // side by side (independent of which one is "active" for the quick-override panel).
  compareScenario: Scenario | null;
  compareScenarioState: ScenarioState | null;
  setCompareScenario: (scenarioId: string | null) => void;
  simulationConfig: SimulationConfig;
  isLoading: boolean;
  usingLocalData: boolean;
  matchNotes: Record<string, string>;
  setMatchNote: (matchId: string, text: string) => void;

  // Time machine: view the entire site as it looked right after a past round
  // (every match after that round reset to unplayed). null = live/current.
  asOfRound: number | null;
  setAsOfRound: (round: number | null) => void;
  availableAsOfRounds: number[];

  // Actions
  setSimulationConfig: (config: SimulationConfig) => void;
  createNewScenario: (name: string, description: string) => Scenario;
  setActiveScenario: (scenarioId: string | null) => void;
  addScenarioOverride: (scenarioId: string, matchId: string, homeScore: number, awayScore: number) => void;
  removeScenarioOverride: (scenarioId: string, matchId: string) => void;
  runSimulation: () => void;
  updateMatch: (matchId: string, updates: Partial<Pick<Match, 'status' | 'homeScore' | 'awayScore'>>) => void;
  resetLocalData: () => void;
  exportLocalData: () => void;
  importLocalData: (file: File) => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const league = leagueData as League;
  const teams = teamsData as Team[];
  const defaultMatches = matchesData as unknown as Match[];

  // Matches start from a local override (if one was saved in this browser before),
  // falling back to the data baked into the build. This is the real, editable
  // data — the time machine (below) only ever filters a view on top of it.
  const [realMatches, setRealMatches] = useState<Match[]>(() => loadOverrideMatches() ?? defaultMatches);
  const [usingLocalData, setUsingLocalData] = useState(() => loadOverrideMatches() !== null);

  // Time machine: when set, every match after this round is treated as if it
  // hadn't been played yet, so the whole app (standings, strengths, sim, path
  // analysis...) recomputes as it would have looked right after that round.
  const [asOfRound, setAsOfRound] = useState<number | null>(null);
  const availableAsOfRounds = useMemo(() => completedRoundsSoFar(realMatches), [realMatches]);
  const matches = useMemo(
    () => (asOfRound === null ? realMatches : snapshotAsOfRound(realMatches, asOfRound)),
    [realMatches, asOfRound]
  );

  // Per-match personal notes, this browser only — pure annotation, never fed into any calculation.
  const [matchNotes, setMatchNotes] = useState<Record<string, string>>(() => loadMatchNotes());
  const setMatchNote = useCallback((matchId: string, text: string) => {
    setMatchNotes((prev) => {
      const next = { ...prev };
      if (text.trim() === '') {
        delete next[matchId];
      } else {
        next[matchId] = text;
      }
      saveMatchNotes(next);
      return next;
    });
  }, []);

  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(createDefaultSimulationConfig);
  // Scenarios (What-If Lab overrides) persist to this browser's localStorage so
  // they survive a page reload.
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());
  useEffect(() => {
    saveScenarios(scenarios);
  }, [scenarios]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute standings
  const standings = useMemo(() => {
    return calculateStandings(league, teams, matches);
  }, [league, teams, matches]);

  // Compute strengths
  const strengths = useMemo(() => {
    return calculateTeamStrengths(teams, matches, league, simulationConfig);
  }, [teams, matches, league, simulationConfig]);

  // Compute predictions
  const predictions = useMemo(() => {
    return predictAllFutureMatches(matches, strengths, teams, league, simulationConfig.formWeighting, simulationConfig.homeAwayAdjustment, simulationConfig.travelFatigue);
  }, [matches, strengths, teams, league, simulationConfig.formWeighting, simulationConfig.homeAwayAdjustment, simulationConfig.travelFatigue]);

  // Only the projection/simulation side (title race, path analysis, scenario search)
  // optionally accounts for the unpublished return leg — real standings and the
  // "next match" list only ever reflect officially published fixtures.
  const { league: projectionLeague, matches: projectionMatches } = useMemo(
    () => withSecondLeg(league, matches, simulationConfig.includeSecondLeg),
    [league, matches, simulationConfig.includeSecondLeg]
  );

  // Run simulation on load
  useEffect(() => {
    const timer = setTimeout(() => {
      const sim = simulateSeason(projectionLeague, teams, projectionMatches, strengths, simulationConfig);
      setSimulation(sim);
      setIsLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [projectionLeague, teams, projectionMatches, strengths, simulationConfig]);

  // Active scenario
  const activeScenario = useMemo(() => {
    if (!activeScenarioId) return null;
    return scenarios.find((s) => s.id === activeScenarioId) ?? null;
  }, [scenarios, activeScenarioId]);

  // Scenario evaluation runs a full Monte Carlo re-simulation (~1s+), so defer it
  // off the render path instead of blocking on scenario creation/override changes.
  const [activeScenarioState, setActiveScenarioState] = useState<ScenarioState | null>(null);
  useEffect(() => {
    if (!activeScenario) {
      setActiveScenarioState(null);
      return;
    }
    const timer = setTimeout(() => {
      setActiveScenarioState(
        evaluateScenario(activeScenario, projectionLeague, teams, projectionMatches, strengths, simulationConfig)
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [activeScenario, projectionLeague, teams, projectionMatches, strengths, simulationConfig]);

  // Compare scenario (What-If Lab side-by-side comparison)
  const [compareScenarioId, setCompareScenarioId] = useState<string | null>(null);
  const compareScenario = useMemo(() => {
    if (!compareScenarioId) return null;
    return scenarios.find((s) => s.id === compareScenarioId) ?? null;
  }, [scenarios, compareScenarioId]);

  const [compareScenarioState, setCompareScenarioState] = useState<ScenarioState | null>(null);
  useEffect(() => {
    if (!compareScenario) {
      setCompareScenarioState(null);
      return;
    }
    const timer = setTimeout(() => {
      setCompareScenarioState(
        evaluateScenario(compareScenario, projectionLeague, teams, projectionMatches, strengths, simulationConfig)
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [compareScenario, projectionLeague, teams, projectionMatches, strengths, simulationConfig]);

  const setCompareScenario = useCallback((scenarioId: string | null) => {
    setCompareScenarioId(scenarioId);
  }, []);

  const pathResult = useMemo(() => {
    if (!simulation) return null;
    return findPaths(projectionLeague, teams, standings, projectionMatches, strengths, simulationConfig);
  }, [projectionLeague, teams, standings, projectionMatches, strengths, simulation, simulationConfig]);

  // Rounds with at least one scheduled (non-target) rival match, for the rooting guide picker.
  const rootingRounds = useMemo(() => {
    const rounds = new Set<number>();
    for (const m of matches) {
      if (m.status === 'scheduled' && m.homeTeamId !== league.targetTeamId && m.awayTeamId !== league.targetTeamId) {
        rounds.add(m.round);
      }
    }
    return Array.from(rounds).sort((a, b) => a - b);
  }, [matches, league.targetTeamId]);

  const [rootingRound, setRootingRound] = useState<number | null>(null);

  // Rooting guide runs its own locked-outcome sub-simulations per rival match, so
  // defer it off the render path the same way scenario evaluation is.
  const [rootingGuide, setRootingGuide] = useState<RootingRecommendation[]>([]);
  useEffect(() => {
    if (!simulation) {
      setRootingGuide([]);
      return;
    }
    const timer = setTimeout(() => {
      setRootingGuide(
        analyzeNextRoundRooting(league, teams, matches, strengths, simulationConfig, rootingRound ?? undefined)
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [league, teams, matches, strengths, simulation, simulationConfig, rootingRound]);

  // Actions

  // Manual data update: edits apply immediately (so the whole app recomputes)
  // and persist to this browser's localStorage as an override over the baked-in data.
  const updateMatch = useCallback((matchId: string, updates: Partial<Pick<Match, 'status' | 'homeScore' | 'awayScore'>>) => {
    setRealMatches((prev) => {
      const next = prev.map((m) => (m.id === matchId ? { ...m, ...updates } : m));
      saveOverrideMatches(next);
      setUsingLocalData(true);
      return next;
    });
  }, []);

  const resetLocalData = useCallback(() => {
    clearOverrideMatches();
    setRealMatches(defaultMatches);
    setUsingLocalData(false);
  }, [defaultMatches]);

  const exportLocalData = useCallback(() => {
    downloadMatchesSaveFile(realMatches);
  }, [realMatches]);

  const importLocalData = useCallback(async (file: File) => {
    const imported = await parseMatchesSaveFile(file);
    saveOverrideMatches(imported);
    setRealMatches(imported);
    setUsingLocalData(true);
  }, []);

  const createNewScenario = useCallback((name: string, description: string) => {
    const id = `scenario-${Date.now()}`;
    const scenario = createScenario(id, name, description);
    setScenarios((prev) => [...prev, scenario]);
    setActiveScenarioId(id);
    return scenario;
  }, []);

  const setActiveScenario = useCallback((scenarioId: string | null) => {
    setActiveScenarioId(scenarioId);
  }, []);

  const addScenarioOverride = useCallback((scenarioId: string, matchId: string, homeScore: number, awayScore: number) => {
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        return addOverride(s, matchId, homeScore, awayScore);
      })
    );
  }, []);

  const removeScenarioOverride = useCallback((scenarioId: string, matchId: string) => {
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        return {
          ...s,
          overrides: s.overrides.filter((o) => o.matchId !== matchId),
        };
      })
    );
  }, []);

  const runSimulation = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      const sim = simulateSeason(projectionLeague, teams, projectionMatches, strengths, simulationConfig);
      setSimulation(sim);
      setIsLoading(false);
    }, 50);
  }, [projectionLeague, teams, projectionMatches, strengths, simulationConfig]);

  const value: DataContextType = {
    league,
    teams,
    matches,
    realMatches,
    projectionLeague,
    projectionMatches,
    standings,
    strengths,
    predictions,
    simulation,
    pathResult,
    rootingGuide,
    rootingRounds,
    rootingRound,
    setRootingRound,
    scenarios,
    activeScenario,
    activeScenarioState,
    compareScenario,
    compareScenarioState,
    setCompareScenario,
    simulationConfig,
    isLoading,
    usingLocalData,
    matchNotes,
    setMatchNote,
    asOfRound,
    setAsOfRound,
    availableAsOfRounds,
    setSimulationConfig,
    createNewScenario,
    setActiveScenario,
    addScenarioOverride,
    removeScenarioOverride,
    runSimulation,
    updateMatch,
    resetLocalData,
    exportLocalData,
    importLocalData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
