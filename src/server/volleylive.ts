import "server-only";
import { z } from "zod";
import { dateLabel, toUTC } from "@/lib/dates";
import { createMatch, type Match, type Team } from "@/lib/speaker/model";

// Public, unauthenticated endpoints used by kamper.volleyball.no itself.
const baseUrl = "https://sf48-terminlister-prod-app.azurewebsites.net/";
const supportedTeamIds = new Set([910930, 913824]); // NTNUI M1 and K1
const dragvollVenueId = 3820;
const tournamentNumbers = new Set(["10101", "10202"]); // Men's elite, women's 1st division
export type FetchJson = (path: string) => Promise<unknown>;
export type ImportResult = { matches: Match[]; warning?: string };
const id = z.coerce.number().int().positive();
const optionalText = z.string().nullish();
const memberSchema = z.object({
  personId: id,
  firstName: optionalText,
  lastName: optionalText,
  teamOrgId: id.optional(),
  number: z.union([z.string(), z.number()]).nullish(),
  position: optionalText,
  captain: z.boolean().nullish(),
  memberType: z.string(),
});
const fixtureSchema = z.object({
  matchId: id,
  seasonId: id,
  tournamentId: id,
  tournamentName: z.string(),
  hometeamId: id,
  awayteamId: id,
  awayteam: z.string(),
  awayteamOrgName: optionalText,
  awayteamOverriddenName: optionalText,
  venueId: z.number(),
  activityAreaName: optionalText,
  matchDate: optionalText,
  matchStartTime: z.number().int().nullish(),
  matchResult: z.unknown().optional(),
  statusTypeId: z.number().nullish(),
});
type Fixture = z.infer<typeof fixtureSchema>;
type Member = z.infer<typeof memberSchema>;

async function fetchPublicJson(path: string) {
  const response = await fetch(new URL(path, baseUrl), {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`VolleyLive ${response.status}`);
  return response.json();
}

function seasonDate(value: string) {
  const date = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
  return date ? `${date[3]}-${date[1]}-${date[2]}` : "";
}

function scheduledAt(fixture: Fixture): string | null {
  if (!fixture.matchDate || fixture.matchStartTime == null) return null;
  const day = fixture.matchDate.slice(0, 10);
  const clock = String(fixture.matchStartTime).padStart(4, "0");
  try {
    return toUTC(`${day}T${clock.slice(0, 2)}:${clock.slice(2)}`);
  } catch {
    return null;
  }
}

function fullName(person: { firstName?: string | null; lastName?: string | null }) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

function fillTeam(team: Team, members: Member[], fromMatch: boolean): Team {
  const players = members.filter((p) => p.memberType === "Player" && fullName(p));
  const playerId = (p: Member) => `${team.id}-p${p.personId}`;
  const captains = fromMatch ? players.filter((p) => p.captain === true) : [];
  const liberos = fromMatch ? players.filter((p) => p.position?.toLowerCase() === "libero") : [];
  return {
    ...team,
    rosterSource: fromMatch ? "match" : "team",
    players: [...new Map(players.map((p) => [p.personId, p])).values()]
      .map((p) => ({
        id: playerId(p),
        name: fullName(p),
        number: p.number == null ? "" : String(p.number),
        starter: false,
      }))
      .sort(
        (a, b) =>
          Number(a.number || Infinity) - Number(b.number || Infinity) ||
          a.name.localeCompare(b.name, "nb"),
      ),
    captainId: captains.length === 1 ? playerId(captains[0]) : "",
    liberoId: liberos.length === 1 ? playerId(liberos[0]) : "",
    coach: fullName(
      members.find((p) => p.memberType === "TeamSupport" && p.position === "Hovedtrener") ?? {},
    ),
  };
}

async function enrichMatch(fixture: Fixture, match: Match, get: FetchJson): Promise<Match> {
  const [membersResult, refsResult] = await Promise.allSettled([
    get(`ta/MatchTeamMembers/${fixture.matchId}?images=false`).then((data) =>
      z.array(memberSchema).parse(data),
    ),
    get(`ta/MatchReferee?matchid=${fixture.matchId}`).then((data) =>
      z
        .array(
          z.object({
            firstName: optionalText,
            lastName: optionalText,
            refereeType: z.string(),
            nonOfficialRefereeName: optionalText,
          }),
        )
        .parse(data),
    ),
  ]);
  let incomplete = membersResult.status === "rejected" || refsResult.status === "rejected";
  const members = membersResult.status === "fulfilled" ? membersResult.value : [];
  const teams = await Promise.all(
    match.teams.map(async (team, i) => {
      const externalId = i === 0 ? fixture.hometeamId : fixture.awayteamId;
      const matchMembers = members.filter((p) => p.teamOrgId === externalId);
      if (matchMembers.some((p) => p.memberType === "Player")) {
        const filled = fillTeam(team, matchMembers, true);
        if (filled.coach) return filled;
        try {
          const roster = z.array(memberSchema).parse(await get(`ta/TeamMembers/${externalId}`));
          return { ...filled, coach: fillTeam(team, roster, false).coach };
        } catch {
          incomplete = true;
          return filled;
        }
      }
      try {
        const roster = z.array(memberSchema).parse(await get(`ta/TeamMembers/${externalId}`));
        return fillTeam(team, roster, false);
      } catch {
        incomplete = true;
        return team;
      }
    }),
  );
  const refs = refsResult.status === "fulfilled" ? refsResult.value : [];
  const referee = (role: string) => {
    const ref = refs.find((r) => r.refereeType === role);
    return ref ? ref.nonOfficialRefereeName?.trim() || fullName(ref) : "";
  };
  return {
    ...match,
    teams: teams as Match["teams"],
    firstReferee: referee("1.dommer"),
    secondReferee: referee("2.dommer"),
    importWarning: incomplete ? "Noe lag- eller dommerinformasjon kunne ikke hentes." : undefined,
  };
}

export async function loadVolleyLiveMatches(
  fetchJson: FetchJson = fetchPublicJson,
  now = new Date(),
): Promise<ImportResult> {
  // Deduplicate shared team rosters within a load; Next caches successful public responses for five minutes.
  const pending = new Map<string, Promise<unknown>>();
  const get: FetchJson = (path) => {
    if (!pending.has(path)) pending.set(path, fetchJson(path));
    return pending.get(path)!;
  };
  try {
    const today = dateLabel(now.toISOString(), "yyyy-MM-dd");
    const year = Number(today.slice(0, 4));
    const seasonsSchema = z.object({
      seasons: z.array(
        z.object({
          seasonId: id,
          sportId: z.number(),
          orgIdOwner: z.number(),
          seasonDateFrom: z.string(),
          seasonDateTo: z.string(),
        }),
      ),
    });
    const seasonResults = await Promise.allSettled(
      [year, year - 1].map(
        async (y) => seasonsSchema.parse(await get(`ta/Seasons/?sportId=157&year=${y}`)).seasons,
      ),
    );
    const seasons = seasonResults.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const season = seasons
      .filter(
        (s) =>
          s.sportId === 157 &&
          s.orgIdOwner === 387 &&
          seasonDate(s.seasonDateFrom) <= today &&
          seasonDate(s.seasonDateTo) >= today,
      )
      .sort((a, b) => seasonDate(b.seasonDateFrom).localeCompare(seasonDate(a.seasonDateFrom)))[0];
    if (!season) throw new Error("No current volleyball season");
    const tournaments = z
      .object({
        tournamentsInSeason: z.array(
          z.object({
            tournamentId: id,
            tournamentNo: z.string(),
            areMatchesPublished: z.boolean(),
            isDeleted: z.boolean(),
            sportId: z.number(),
          }),
        ),
      })
      .parse(await get(`ta/Tournament/Season/${season.seasonId}`))
      .tournamentsInSeason.filter(
        (t) =>
          tournamentNumbers.has(t.tournamentNo) &&
          t.areMatchesPublished &&
          !t.isDeleted &&
          t.sportId === 157,
      );
    if (!tournaments.length) throw new Error("No published supported tournaments");
    let invalidFixture = false;
    const results = await Promise.allSettled(
      tournaments.map(async (t) => {
        const data = z
          .object({ matches: z.array(z.unknown()) })
          .parse(await get(`ta/TournamentMatches/?tournamentId=${t.tournamentId}`));
        const parsed = data.matches.flatMap((row) => {
          const result = fixtureSchema.safeParse(row);
          if (!result.success) {
            invalidFixture = true;
            return [];
          }
          return [result.data];
        });
        return parsed.filter(
          (m) => m.seasonId === season.seasonId && m.tournamentId === t.tournamentId,
        );
      }),
    );
    const fixtures = new Map<number, { fixture: Fixture; match: Match }>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const fixture of result.value) {
        if (
          !supportedTeamIds.has(fixture.hometeamId) ||
          fixture.venueId !== dragvollVenueId ||
          fixture.matchResult != null ||
          (fixture.statusTypeId != null && (fixture.statusTypeId < 1 || fixture.statusTypeId > 5))
        )
          continue;
        const date = scheduledAt(fixture);
        if (!date || dateLabel(date, "yyyy-MM-dd") < today) continue;
        const match = createMatch(`volleylive-${fixture.matchId}`, date);
        match.competition = fixture.tournamentName;
        match.venue = fixture.activityAreaName?.trim() || "Dragvollhallen";
        match.teams[1].name =
          fixture.awayteamOverriddenName?.trim() ||
          fixture.awayteamOrgName?.trim() ||
          fixture.awayteam;
        match.sourceUrl = `https://kamper.volleyball.no/scoreboard?seasonId=${fixture.seasonId}&tournamentId=${fixture.tournamentId}`;
        fixtures.set(fixture.matchId, { fixture, match });
      }
    }
    // Bound concurrency to avoid overwhelming the public service on a cold load.
    const queue = [...fixtures.values()].sort((a, b) =>
      a.match.scheduledAt.localeCompare(b.match.scheduledAt),
    );
    const matches: Match[] = [];
    for (let i = 0; i < queue.length; i += 4) {
      matches.push(
        ...(await Promise.all(
          queue.slice(i, i + 4).map(({ fixture, match }) => enrichMatch(fixture, match, get)),
        )),
      );
    }
    return {
      matches,
      warning:
        invalidFixture || results.some((r) => r.status === "rejected")
          ? "Noen kamper kunne ikke hentes fra VolleyLive."
          : undefined,
    };
  } catch {
    return {
      matches: [],
      warning: "Kunne ikke hente kamper fra VolleyLive. Prøv igjen senere, eller legg til en kamp.",
    };
  }
}
