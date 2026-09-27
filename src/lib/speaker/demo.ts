import { createMatch } from "./model";

export function demoMatches(now = new Date()) {
  const names = [
    "Alex",
    "Robin",
    "Kim",
    "Charlie",
    "Sasha",
    "Andrea",
    "Noa",
    "Emil",
    "Luca",
    "Iben",
    "Elliot",
    "Ari",
  ];
  const surnames = [
    "Berg",
    "Dahl",
    "Lunde",
    "Vik",
    "Solheim",
    "Moen",
    "Aas",
    "Strand",
    "Haugen",
    "Lien",
    "Bakke",
    "Ness",
  ];
  return ["Fjordvik VBK", "Nordstrand Volley", "Solheim VBK"].map((opponent, i) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2 + i * 5, 13),
    );
    const match = createMatch(`demo-${i}`, date.toISOString());
    match.competition = i === 1 ? "Menn" : "Kvinner";
    match.teams[1].name = opponent;
    match.firstReferee = "Frida Eksempel";
    match.secondReferee = "Jonas Eksempel";
    for (const team of match.teams) {
      team.players = names.map((name, n) => ({
        id: `${team.id}-${n}`,
        number: String(n + 1),
        name: `${name} ${surnames[(n + (team.isNtnui ? 0 : 3)) % surnames.length]}`,
        starter: n < 6,
      }));
      team.captainId = team.players[1].id;
      team.liberoId = team.players[6].id;
      team.coach = team.isNtnui ? "Morgan Eksempel" : "Erik Eksempel";
    }
    return match;
  });
}
