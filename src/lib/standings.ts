export type Standing = {
  id: number;
  rank: number | null;
  team: string;
  played: number | null;
  wins: number | null;
  losses: number | null;
  points: number | null;
  setsWon: number | null;
  setsLost: number | null;
  setDifference: number | null;
  rallyPointsWon: number | null;
  rallyPointsLost: number | null;
  rallyPointDifference: number | null;
};

export type Standings = {
  tournament: string;
  season: string | null;
  published: boolean;
  rows: Standing[];
  sourceUrl: string;
  fetchedAt: string;
};
