// Demo match data generator
// 10 teams, 30 rounds, 5 matches per round = 150 total matches
// First 20 rounds completed, rounds 21-30 scheduled

interface MatchData {
  id: string;
  seasonId: string;
  round: number;
  date: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: 'completed' | 'scheduled';
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  notes: string;
}

const teamIds = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'];

// Seeded random for reproducibility
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

// Team strength approximation for realistic results
const teamStrength: Record<string, number> = {
  t1: 92, // Red Lions - strong
  t2: 88, // Blue Stars - strong
  t3: 82, // Green Athletic - good
  t4: 78, // Yellow Phoenix - decent
  t5: 75, // White City - decent
  t6: 70, // Black Thunder - mid
  t7: 65, // Orange Tigers - lower mid
  t8: 58, // Purple Warriors - weak
  t9: 52, // Silver Eagles - weak
  t10: 45, // Brown Wolves - weakest
};

function simulateGoals(homeStr: number, awayStr: number, isHome: boolean): [number, number] {
  const homeAdv = isHome ? 8 : 0;
  const diff = (homeStr + homeAdv) - awayStr;
  const homeExpected = 1.3 + diff * 0.02;
  const awayExpected = 1.3 - diff * 0.02;

  // Poisson-like sampling
  let hg = 0;
  let p = Math.exp(-homeExpected);
  let cum = p;
  const r1 = rng();
  while (r1 > cum && hg < 8) {
    hg++;
    p *= homeExpected / hg;
    cum += p;
  }

  let ag = 0;
  p = Math.exp(-awayExpected);
  cum = p;
  const r2 = rng();
  while (r2 > cum && ag < 8) {
    ag++;
    p *= awayExpected / ag;
    cum += p;
  }

  return [hg, ag];
}

// Generate round-robin schedule (each team plays every other team twice)
function generateSchedule(): [string, string][] {
  const fixtures: [string, string][] = [];
  const n = teamIds.length;

  // Round-robin pairing
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      fixtures.push([teamIds[i], teamIds[j]]);
    }
  }

  return fixtures;
}

const allFixtures = generateSchedule();

// Distribute into rounds (5 matches per round for 10 teams)
const roundMatchups: [string, string][][] = [];
const usedInRound: Set<string>[] = [];

// Simple greedy assignment
for (let r = 0; r < 30; r++) {
  roundMatchups.push([]);
  usedInRound.push(new Set());
}

let fixtureIdx = 0;
for (let round = 0; round < 30; round++) {
  for (const [home, away] of allFixtures) {
    if (fixtureIdx >= allFixtures.length) break;
    const f = allFixtures[fixtureIdx];
    if (!usedInRound[round].has(f[0]) && !usedInRound[round].has(f[1])) {
      roundMatchups[round].push(f);
      usedInRound[round].add(f[0]);
      usedInRound[round].add(f[1]);
      fixtureIdx++;
      if (roundMatchups[round].length >= 5) break;
    }
  }
  if (fixtureIdx >= allFixtures.length) break;
}

// Fill any gaps by distributing remaining fixtures
while (fixtureIdx < allFixtures.length) {
  const f = allFixtures[fixtureIdx];
  let placed = false;
  for (let round = 0; round < 30; round++) {
    if (roundMatchups[round].length < 5 &&
        !usedInRound[round].has(f[0]) &&
        !usedInRound[round].has(f[1])) {
      roundMatchups[round].push(f);
      usedInRound[round].add(f[0]);
      usedInRound[round].add(f[1]);
      fixtureIdx++;
      placed = true;
      break;
    }
  }
  if (!placed) {
    // Force into first available round
    for (let round = 0; round < 30; round++) {
      if (!usedInRound[round].has(f[0]) && !usedInRound[round].has(f[1])) {
        roundMatchups[round].push(f);
        usedInRound[round].add(f[0]);
        usedInRound[round].add(f[1]);
        fixtureIdx++;
        break;
      }
    }
    if (!placed) fixtureIdx++; // skip if truly impossible
  }
}

// Build match objects
const matches: MatchData[] = [];
let matchNum = 1;

const dates: string[] = [];
for (let r = 0; r < 30; r++) {
  const baseDate = new Date(2025, 8, 13); // Sep 13, 2025
  baseDate.setDate(baseDate.getDate() + r * 7);
  dates.push(baseDate.toISOString().split('T')[0]);
}

for (let round = 0; round < 30; round++) {
  const matchups = roundMatchups[round];
  if (!matchups) continue;

  for (const [home, away] of matchups) {
    const matchId = `m${String(matchNum).padStart(3, '0')}`;
    const isCompleted = round < 20;

    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (isCompleted) {
      const [h, a] = simulateGoals(
        teamStrength[home],
        teamStrength[away],
        true
      );
      homeScore = h;
      awayScore = a;
    }

    matches.push({
      id: matchId,
      seasonId: 'demo-2026',
      round: round + 1,
      date: isCompleted ? dates[round] : dates[round],
      homeTeamId: home,
      awayTeamId: away,
      status: isCompleted ? 'completed' : 'scheduled',
      homeScore,
      awayScore,
      source: 'demo',
      notes: '',
    });

    matchNum++;
  }
}

// Output as JSON string
const output = JSON.stringify(matches, null, 2);

// Write to stdout for capture
console.log(output);
