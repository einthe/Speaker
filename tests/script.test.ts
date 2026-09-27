import { expect, it } from "vitest";
import { demoMatches } from "@/lib/speaker/demo";
import { createMatch, setLibero, setStarter } from "@/lib/speaker/model";
import { buildSpeakerScript } from "@/lib/speaker/script";

it("announces NTNUI last regardless of team order, including captains and coaches", () => {
  const match = demoMatches()[0];
  const ntnui = match.teams.find((team) => team.isNtnui)!;
  const libero = ntnui.players.find((player) => player.id === ntnui.liberoId)!;
  libero.number = "0";
  for (const reverse of [false, true]) {
    if (reverse) match.teams.reverse();
    const script = buildSpeakerScript(match);
    const lineups = script.filter((s) => s.id.startsWith("lineup-"));
    expect(lineups.map((s) => s.title)).toEqual(["Fjordvik VBK", "NTNUI"]);
    const introduction = script.find((s) => s.id === "introductions")!;
    expect(introduction.text.split("\n\n")).toEqual([
      "Bortelaget har sin kaptein i spiller nummer 2, Robin Solheim,\nog sin trener i Erik Eksempel.",
      "Så, på NTNUI har vi kaptein i spiller nummer 2, Robin Dahl,\nog trener Morgan Eksempel.",
    ]);
    const players = lineups[1].text.split("\n\n")[1].split("\n");
    expect(players).toHaveLength(7);
    expect(players[6]).toBe(`0 ${libero.name}`);
    expect(lineups[1].text).not.toContain("Libero er");
    expect(lineups[1].text).not.toContain("Emil Strand");
  }
});

it("uses manual edits immediately and keeps a partial script readable", () => {
  const match = createMatch("manual", "2026-09-27T13:00:00Z");
  let script = buildSpeakerScript(match);
  expect(script.find((s) => s.id === "referees")!.text).toContain("[førstedommer]");
  expect(script.filter((s) => s.id.startsWith("lineup-"))[0].text).toContain("[Startsekser]");
  match.teams[0].players = [{ id: "p", name: "Test Spiller", number: "9", starter: true }];
  match.teams[0].captainId = "p";
  match.awardPlayerId = "p";
  script = buildSpeakerScript(match);
  expect(script.find((s) => s.id === "lineup-manual-ntnui")!.text).toContain("9 Test Spiller");
  expect(script.find((s) => s.id === "award")!.text).toContain("nummer 9 på NTNUI, Test Spiller");
  expect(script.find((s) => s.id === "handshake")!.instruction).toBe(true);
  expect(JSON.stringify(script)).not.toMatch(/undefined|null|verified|warning/);
});

it("keeps six starters separate from the libero without modifying other matches", () => {
  const matches = demoMatches();
  let team = matches[0].teams[0];
  expect(setStarter(team, team.players[7].id, true)).toBe(team);
  team = setLibero(team, team.players[0].id);
  expect(team.players.filter((p) => p.starter)).toHaveLength(5);
  team = setStarter(team, team.players[0].id, true);
  expect(team.liberoId).toBe("");
  expect(team.players.filter((p) => p.starter)).toHaveLength(6);
  expect(matches[0].teams[0].liberoId).toBe(matches[0].teams[0].players[6].id);
  expect(matches[1].teams[0].players[0].name).toBe("Alex Berg");
});
