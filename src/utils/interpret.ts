// Turns a raw number into a short natural-language read, for hover tooltips
// on the values themselves (not the labels — HoverInfo on a label explains
// what the metric is, this explains what THIS number means).

import type { Lang } from '../i18n/I18nContext.tsx';
import type { TeamStrength } from '../types/index.ts';

type Bucket = { min: number; ko: string; en: string };

function pick(value: number, buckets: Bucket[]): Bucket {
  for (const b of buckets) {
    if (value >= b.min) return b;
  }
  return buckets[buckets.length - 1];
}

function say(bucket: Bucket, lang: Lang): string {
  return lang === 'en' ? bucket.en : bucket.ko;
}

// 0-1 probability (title chance, win prob, etc.)
export function interpretProbability(p: number, lang: Lang): string {
  const pct = Math.round(p * 100);
  const bucket = pick(pct, [
    { min: 95, ko: '사실상 확정임', en: 'essentially locked in' },
    { min: 80, ko: '유력함', en: 'a strong favorite' },
    { min: 60, ko: '우세한 편', en: 'the likelier outcome' },
    { min: 40, ko: '반반에 가까움', en: 'close to a coin flip' },
    { min: 20, ko: '쉽지 않음', en: 'an uphill climb' },
    { min: 5, ko: '희박함', en: 'a long shot' },
    { min: 0, ko: '사실상 없음', en: 'essentially over' },
  ]);
  return say(bucket, lang);
}

// Goal difference (can be negative).
export function interpretGoalDiff(gd: number, lang: Lang): string {
  const bucket = pick(gd, [
    { min: 15, ko: '압도적으로 좋음', en: 'dominant' },
    { min: 5, ko: '꽤 좋은 편', en: 'solid' },
    { min: 1, ko: '조금 앞섬', en: 'slightly positive' },
    { min: 0, ko: '균형 잡힘', en: 'balanced' },
    { min: -4, ko: '조금 밀림', en: 'slightly behind' },
    { min: -14, ko: '꽤 안 좋음', en: 'struggling' },
    { min: -Infinity, ko: '심각하게 안 좋음', en: 'in serious trouble' },
  ]);
  return say(bucket, lang);
}

// Control index (0-100, how much the title race is in the team's own hands).
export function interpretControlIndex(pct: number, lang: Lang): string {
  const bucket = pick(pct, [
    { min: 80, ko: '거의 다 자기 손에 달림', en: 'almost entirely self-determined' },
    { min: 55, ko: '자력 비중이 큰 편', en: 'mostly in their own hands' },
    { min: 30, ko: '자력·타력이 반반', en: 'a mix of self and rival results' },
    { min: 0, ko: '남 결과에 많이 좌우됨', en: 'heavily dependent on rivals' },
  ]);
  return say(bucket, lang);
}

// Simulated strength rating (0-100, 50 = neutral).
export function interpretStrength(rating: number, lang: Lang): string {
  const bucket = pick(rating, [
    { min: 70, ko: '리그 최상위권 전력', en: 'top-tier form' },
    { min: 58, ko: '평균 이상', en: 'above average' },
    { min: 42, ko: '평균 수준', en: 'around average' },
    { min: 30, ko: '평균 이하', en: 'below average' },
    { min: -Infinity, ko: '리그 최하위권 전력', en: 'bottom-tier form' },
  ]);
  return say(bucket, lang);
}

interface MatchReasonFactor {
  gap: number; // signed: positive favors home, negative favors away
  homeVal: number;
  awayVal: number;
  homeKo: string;
  awayKo: string;
  homeEn: string;
  awayEn: string;
}

export interface TeamRecordSummary {
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export function formatRecord(r: TeamRecordSummary, lang: Lang): string {
  return lang === 'en'
    ? `${r.wins}W-${r.draws}D-${r.losses}L, ${r.points}pts`
    : `${r.wins}승 ${r.draws}무 ${r.losses}패, ${r.points}점`;
}

const fmt1 = (n: number) => Math.round(n * 10) / 10;

// Why the model leans the way it does for one match — picks the 1-2 biggest
// gaps between the two teams (overall rating, attack-vs-defense matchup,
// recent form, and each side's own home/away split), cites the actual
// numbers behind them, and leads with each side's season record.
export function interpretMatchPrediction(
  homeName: string,
  awayName: string,
  homeStr: TeamStrength,
  awayStr: TeamStrength,
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  lang: Lang,
  homeRecord?: TeamRecordSummary,
  awayRecord?: TeamRecordSummary
): string {
  const factors: MatchReasonFactor[] = [
    {
      gap: homeStr.overall - awayStr.overall,
      homeVal: homeStr.overall, awayVal: awayStr.overall,
      homeKo: `${homeName} 종합 전력 우위`,
      awayKo: `${awayName} 종합 전력 우위`,
      homeEn: `${homeName} rate higher overall`,
      awayEn: `${awayName} rate higher overall`,
    },
    {
      gap: (homeStr.attack - awayStr.defense) - (awayStr.attack - homeStr.defense),
      homeVal: homeStr.attack, awayVal: awayStr.defense,
      homeKo: `${homeName} 공격이 ${awayName} 수비보다 우위`,
      awayKo: `${awayName} 공격이 ${homeName} 수비보다 우위`,
      homeEn: `${homeName}'s attack matches up well against ${awayName}'s defense`,
      awayEn: `${awayName}'s attack matches up well against ${homeName}'s defense`,
    },
    {
      gap: homeStr.formRating - awayStr.formRating,
      homeVal: homeStr.formRating, awayVal: awayStr.formRating,
      homeKo: `${homeName} 최근 폼 우위`,
      awayKo: `${awayName} 최근 폼 우위`,
      homeEn: `${homeName} are in better recent form`,
      awayEn: `${awayName} are in better recent form`,
    },
    {
      gap: homeStr.homeStrength - awayStr.awayStrength,
      homeVal: homeStr.homeStrength, awayVal: awayStr.awayStrength,
      homeKo: `${homeName} 홈에서 특히 강함`,
      awayKo: `${awayName} 원정에서도 잘함`,
      homeEn: `${homeName} are especially strong at home`,
      awayEn: `${awayName} travel well`,
    },
  ];

  const favored = homeWinProb >= drawProb && homeWinProb >= awayWinProb
    ? 'home'
    : awayWinProb >= drawProb
    ? 'away'
    : 'draw';

  // Only cite factors that actually point the same direction as the model's
  // pick — a factor favoring the other side would contradict the sentence
  // (e.g. "home favored: away side has better form" makes no sense).
  const ranked = [...factors].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const aligned = favored === 'draw'
    ? ranked
    : ranked.filter((f) => (favored === 'home' ? f.gap > 0 : f.gap < 0));
  const top = aligned.filter((f) => Math.abs(f.gap) >= 3).slice(0, 2);

  const factorPhrase = (f: MatchReasonFactor) =>
    lang === 'en'
      ? `${f.gap > 0 ? f.homeEn : f.awayEn} (${fmt1(f.homeVal)} vs ${fmt1(f.awayVal)})`
      : `${f.gap > 0 ? f.homeKo : f.awayKo} (${fmt1(f.homeVal)} vs ${fmt1(f.awayVal)})`;

  const reasonText = () => top.map(factorPhrase).join(lang === 'en' ? '; ' : ', ');

  const recordLine =
    homeRecord && awayRecord
      ? (lang === 'en'
          ? `${homeName} ${formatRecord(homeRecord, lang)} · ${awayName} ${formatRecord(awayRecord, lang)}\n`
          : `${homeName} ${formatRecord(homeRecord, lang)} · ${awayName} ${formatRecord(awayRecord, lang)}\n`)
      : '';

  if (favored === 'draw') {
    const body = top.length === 0
      ? (lang === 'en' ? 'Close matchup — the two sides are rated closely across the board, so a draw is live too.' : '팽팽한 매치업 — 양팀 전력이 여러모로 비슷해서 무승부 가능성도 낮지 않음.')
      : (lang === 'en' ? `Close matchup — ${reasonText()}, so a draw is live too.` : `팽팽한 매치업 — ${reasonText()}, 무승부 가능성도 낮지 않음.`);
    return recordLine + body;
  }
  const winnerName = favored === 'home' ? homeName : awayName;
  if (top.length === 0) {
    // No individual stat clearly favors the pick (often just home-field edge
    // baked into the goal model) — say so honestly instead of forcing a reason.
    const body = lang === 'en'
      ? `${winnerName} favored, mainly on ${favored === 'home' ? 'home-field edge' : 'the matchup'} rather than any one standout stat.`
      : `${winnerName} 쪽 우세 — 특별히 두드러진 지표보단 ${favored === 'home' ? '홈 이점' : '매치업'} 영향이 큼.`;
    return recordLine + body;
  }
  const body = lang === 'en'
    ? `${winnerName} favored: ${reasonText()}.`
    : `${winnerName} 쪽 우세: ${reasonText()}.`;
  return recordLine + body;
}

// Points-per-game-style form score (0-3), already scaled from last-5 results.
export function interpretForm(formPoints: number, lang: Lang): string {
  const bucket = pick(formPoints, [
    { min: 2.4, ko: '최근 폼 매우 좋음', en: 'in excellent recent form' },
    { min: 1.6, ko: '최근 폼 괜찮음', en: 'in decent recent form' },
    { min: 0.8, ko: '최근 폼 애매함', en: 'in mixed recent form' },
    { min: -Infinity, ko: '최근 폼 안 좋음', en: 'in poor recent form' },
  ]);
  return say(bucket, lang);
}
