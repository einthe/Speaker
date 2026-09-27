export type Player = {
  id: string;
  number: string;
  name: string;
  starter: boolean;
};

export type Team = {
  id: string;
  name: string;
  isNtnui: boolean;
  players: Player[];
  captainId: string;
  liberoId: string;
  coach: string;
};

export type Match = {
  id: string;
  scheduledAt: string;
  competition: string;
  venue: string;
  teams: [Team, Team];
  firstReferee: string;
  secondReferee: string;
  awardPlayerId: string;
  notes: string;
};

export function announcementTeams(match: Match): Team[] {
  return [...match.teams].sort((a, b) => Number(a.isNtnui) - Number(b.isNtnui));
}

export function createMatch(id: string, scheduledAt: string): Match {
  const team = (isNtnui: boolean): Team => ({
    id: `${id}-${isNtnui ? "ntnui" : "opponent"}`,
    name: isNtnui ? "NTNUI" : "",
    isNtnui,
    players: [],
    captainId: "",
    liberoId: "",
    coach: "",
  });
  return {
    id,
    scheduledAt,
    competition: "",
    venue: "Dragvollhallen",
    teams: [team(true), team(false)],
    firstReferee: "",
    secondReferee: "",
    awardPlayerId: "",
    notes: "",
  };
}

export function setStarter(team: Team, playerId: string, starter: boolean): Team {
  if (starter && team.players.filter((p) => p.starter).length >= 6) return team;
  return {
    ...team,
    liberoId: starter && team.liberoId === playerId ? "" : team.liberoId,
    players: team.players.map((p) => (p.id === playerId ? { ...p, starter } : p)),
  };
}

export function setLibero(team: Team, playerId: string): Team {
  return {
    ...team,
    liberoId: playerId,
    players: team.players.map((p) => (p.id === playerId ? { ...p, starter: false } : p)),
  };
}
