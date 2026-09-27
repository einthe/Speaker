import { announcementTeams, type Match, type Player, type Team } from "./model";

type ScriptPart = { text: string; dynamic: boolean };
type ScriptText = { text: string; parts: ScriptPart[] };
export type ScriptSection = {
  id: string;
  title: string;
  text: string;
  parts?: ScriptPart[];
  instruction?: boolean;
};

// Interpolated values are highlighted; literal script wording remains plain text.
function speech(strings: TemplateStringsArray, ...values: (string | ScriptText)[]): ScriptText {
  const parts: ScriptPart[] = [];
  strings.forEach((text, i) => {
    if (text) parts.push({ text, dynamic: false });
    const value = values[i];
    if (typeof value === "string") parts.push({ text: value, dynamic: true });
    else if (value) parts.push(...value.parts);
  });
  return { text: parts.map((p) => p.text).join(""), parts };
}

function joinSpeech(lines: ScriptText[], separator: string): ScriptText {
  const parts = lines.flatMap((line, i) => [
    ...(i ? [{ text: separator, dynamic: false }] : []),
    ...line.parts,
  ]);
  return { text: parts.map((p) => p.text).join(""), parts };
}

function teamName(team: Team) {
  return team.isNtnui ? speech`NTNUI` : speech`${team.name.trim() || "[motstander]"}`;
}

function playerName(player?: Player): ScriptText {
  return player
    ? speech`nummer ${player.number || "[nummer]"}, ${player.name.trim() || "[navn]"}`
    : speech`${"[kaptein]"}`;
}

function lineup(team: Team): ScriptSection {
  const starters = team.players.filter((p) => p.starter && p.id !== team.liberoId);
  const libero = team.players.find((p) => p.id === team.liberoId);
  const players = starters.length
    ? joinSpeech(
        starters.map((p) => speech`${p.number || "[nummer]"} ${p.name.trim() || "[navn]"}`),
        "\n",
      )
    : speech`${"[Startsekser]"}`;
  const liberoLine = libero
    ? speech`${libero.number || "[nummer]"} ${libero.name.trim() || "[navn]"}`
    : speech`${"[Libero]"}`;
  return {
    id: `lineup-${team.id}`,
    title: team.name.trim() || "[motstander]",
    ...speech`${team.isNtnui ? speech`På NTNUI starter spiller nummer …` : speech`${teamName(team)} starter med følgende spillere…`}\n\n${players}\n${liberoLine}`,
  };
}

// Adapted from “Speaker BK Trømsø.pdf”; stage directions stay separate from speech.
export function buildSpeakerScript(match: Match): ScriptSection[] {
  const teams = announcementTeams(match);
  const opponent = teams.find((t) => !t.isNtnui)?.name.trim() || "[motstander]";
  const venue = match.venue.trim() || "[hall]";
  const winnerTeam = teams.find((t) => t.players.some((p) => p.id === match.awardPlayerId));
  const winner = winnerTeam?.players.find((p) => p.id === match.awardPlayerId);
  return [
    {
      id: "welcome",
      title: "Velkommen",
      ...speech`Jeg vil på vegne av NTNUI Volleyball ønske hjertelig velkommen til kamp i ${venue}.\n\nDagens motstander er ${opponent}.`,
    },
    {
      id: "introductions",
      title: "Kapteiner og trenere",
      ...joinSpeech(
        teams.map((t) =>
          t.isNtnui
            ? speech`Så, på NTNUI har vi kaptein i spiller ${playerName(t.players.find((p) => p.id === t.captainId))},\nog trener ${t.coach.trim() || "[trener]"}.`
            : speech`Bortelaget har sin kaptein i spiller ${playerName(t.players.find((p) => p.id === t.captainId))},\nog sin trener i ${t.coach.trim() || "[trener]"}.`,
        ),
        "\n\n",
      ),
    },
    {
      id: "handshake",
      title: "Håndhilsing",
      instruction: true,
      text: "Håndhilsing\nDommere til midten av banen",
    },
    {
      id: "referees",
      title: "Dagens dommere",
      ...speech`Dagens førstedommer er ${match.firstReferee.trim() || "[førstedommer]"}. Og dagens andredommer er ${match.secondReferee.trim() || "[andredommer]"}.`,
    },
    {
      id: "good-match",
      title: "God kamp",
      ...speech`Vi ønsker lagene, dommerne og publikum en riktig god kamp, og vi gleder oss til mye bra volleyball her i ${venue}!`,
    },
    {
      id: "referee-chair",
      title: "Startoppstilling",
      instruction: true,
      text: "1. dommer oppe på dommerstol",
    },
    ...teams.map(lineup),
    {
      id: "match",
      title: "Kampen spilles",
      instruction: true,
      text: "Kampen spilles ferdig",
    },
    {
      id: "award",
      title: "Banens beste",
      ...speech`Da er det på tide å kåre banens beste spiller.\n\nBanens beste spiller går til ${winner && winnerTeam ? speech`nummer ${winner.number || "[nummer]"} på ${teamName(winnerTeam)}, ${winner.name.trim() || "[navn]"}` : speech`nummer ${"[nummer]"} på ${"[lag]"}, ${"[navn]"}`}.\n\nGratulerer!`,
    },
  ];
}
