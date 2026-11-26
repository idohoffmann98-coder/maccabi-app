// לקוח ל-API הציבורי של היורוליג (פיד הנתונים הרשמי)
import { config } from './config.js';

const V2 = 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions';
const V3 = 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v3/competitions';

async function getJSON(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

const c = config.competition;

export async function fetchTeamGames(season, team) {
  const j = await getJSON(`${V2}/${c}/seasons/${season}/games?teamCode=${team}`);
  return (j.data || []).map(normalizeGame);
}

export async function fetchGame(season, code) {
  const j = await getJSON(`${V2}/${c}/seasons/${season}/games/${code}`);
  return normalizeGame(j.data || j);
}

export async function fetchBoxscore(season, code, game) {
  const j = await getJSON(`${V2}/${c}/seasons/${season}/games/${code}/stats`);
  const side = (s, teamCode) => ({
    code: teamCode,
    coach: s?.coach?.name || '',
    players: (s?.players || []).map((p) => ({
      code: p.player.person.code,
      name: p.player.person.name,
      dorsal: p.player.dorsal,
      headshot: p.player.images?.headshot || null,
      min: Math.round((p.stats.timePlayed || 0) / 60),
      sec: p.stats.timePlayed || 0,
      pts: p.stats.points || 0,
      reb: p.stats.totalRebounds || 0,
      ast: p.stats.assistances || 0,
      stl: p.stats.steals || 0,
      blk: p.stats.blocksFavour || 0,
      tov: p.stats.turnovers || 0,
      pir: p.stats.valuation || 0,
      fgm2: p.stats.fieldGoalsMade2 || 0, fga2: p.stats.fieldGoalsAttempted2 || 0,
      fgm3: p.stats.fieldGoalsMade3 || 0, fga3: p.stats.fieldGoalsAttempted3 || 0,
      ftm: p.stats.freeThrowsMade || 0, fta: p.stats.freeThrowsAttempted || 0,
      pm: p.stats.plusMinus || 0,
      starter: !!p.stats.startFive,
    })),
    total: s?.total || null,
  });
  return {
    code,
    season,
    home: side(j.local, game.home.code),
    away: side(j.road, game.away.code),
  };
}

export async function fetchRoster(season, team) {
  const j = await getJSON(`${V2}/${c}/seasons/${season}/clubs/${team}/people`);
  const list = Array.isArray(j) ? j : j.data || [];
  const players = list
    .filter((p) => p.type === 'J' && p.active)
    .map((p) => ({
      code: p.person.code,
      name: p.person.name,
      dorsal: p.dorsal,
      position: p.positionName,
      country: p.person.country?.name || '',
      birthDate: p.person.birthDate,
      height: p.person.height || null,
      headshot: p.images?.headshot || null,
    }));
  const coach = list.find((p) => p.type === 'E')?.person?.name || '';
  return { players, coach };
}

export async function fetchStandings(season, round) {
  const j = await getJSON(`${V3}/${c}/seasons/${season}/rounds/${round}/basicstandings`);
  return (j.teams || []).map((t) => ({
    position: t.position,
    code: t.club.code,
    name: t.club.editorialName || t.club.abbreviatedName || t.club.name,
    crest: t.club.images?.crest || null,
    played: t.gamesPlayed,
    won: t.gamesWon,
    lost: t.gamesLost,
    pct: t.winPercentage,
    diff: t.pointsDifference,
    pf: t.pointsFor,
    pa: t.pointsAgainst,
    home: t.homeRecord,
    away: t.awayRecord,
    form: t.last5Form || [],
  }));
}

export function normalizeGame(g) {
  const team = (t) => ({
    code: t.code,
    name: t.editorialName || t.abbreviatedName || t.name,
    score: t.score ?? 0,
    crest: t.imageUrls?.crest || null,
    quarters: t.quarters || null,
  });
  return {
    code: g.code,
    season: g.season?.code,
    round: g.round?.round,
    roundName: g.round?.name,
    phase: g.phaseType?.code,
    date: g.date,
    status: g.status, // confirmed | result | (live statuses)
    quarter: g.quarter,
    remainingTime: g.remainingTime,
    minute: g.minute,
    venue: g.venue?.name || '',
    audience: g.audience || null,
    home: team(g.home),
    away: team(g.away),
  };
}

export const isFinished = (g) => g.status === 'result';
export const isScheduled = (g) => ['confirmed', 'scheduled', 'pending', 'postponed'].includes(g.status);
export const isLive = (g) => !isFinished(g) && !isScheduled(g);

// משחקי שלב מסוים בעונה (כל הקבוצות): PI = פליי-אין, PO = פלייאוף, FF = פיינל פור
export async function fetchPhaseGames(season, phase) {
  const j = await getJSON(`${V2}/${c}/seasons/${season}/games?phaseTypeCode=${phase}&limit=100`);
  return (j.data || []).map((g) => ({ ...normalizeGame(g), group: g.group?.name || '' }));
}
