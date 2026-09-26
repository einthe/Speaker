import { describe, it, expect } from "vitest";
import {
  courtPosition,
  lineupRoles,
  type LineupRole,
  type Player,
  type Revision,
} from "../src/lib/domain";
import { eligibleFor, initialLineup } from "../src/lib/lineup";

const player = {
  id: "player",
  base_role: "player",
  account_status: "approved",
  player_positions: [
    { position_key: "outside_hitter", is_primary: true },
    { position_key: "libero", is_primary: false },
  ],
} as Player;
describe("lineup role rotation", () => {
  it("rotates every role relative to the setter in all six starting positions", () => {
    const roles: LineupRole[] = ["setter", "k1", "m1", "opposite", "k2", "m2"];
    const expected = [
      [1, 2, 3, 4, 5, 6],
      [2, 3, 4, 5, 6, 1],
      [3, 4, 5, 6, 1, 2],
      [4, 5, 6, 1, 2, 3],
      [5, 6, 1, 2, 3, 4],
      [6, 1, 2, 3, 4, 5],
    ];
    for (let setter = 1; setter <= 6; setter++) {
      expect(roles.map((role) => courtPosition(role, setter))).toEqual(expected[setter - 1]);
      expect(courtPosition("libero", setter)).toBeNull();
    }
  });
  it("accepts either assigned position, but no unrelated position or disabled player", () => {
    expect(eligibleFor(player, "k1")).toBe(true);
    expect(eligibleFor(player, "k2")).toBe(true);
    expect(eligibleFor(player, "libero")).toBe(true);
    expect(eligibleFor(player, "opposite")).toBe(false);
    expect(eligibleFor({ ...player, account_status: "disabled" }, "k1")).toBe(false);
  });
  it("restores role identity and setter start from incomplete saved drafts", () => {
    const revision = {
      setter_position: 5,
      lineup_revision_slots: [
        { player_user_id: player.id, lineup_role: "k2", court_position: 3, is_libero: false },
      ],
    } as Revision;
    expect(initialLineup(revision, [player])).toEqual({
      setterPosition: 5,
      selection: { k2: player.id },
      needsReview: false,
    });
    expect(initialLineup(revision, [])).toEqual({
      setterPosition: 5,
      selection: {},
      needsReview: true,
    });
  });
  it("infers compatible legacy slots without rewriting history or assigning an ineligible role", () => {
    const setter = {
      ...player,
      id: "setter",
      player_positions: [{ position_key: "setter", is_primary: true }],
    } as Player;
    const revision = {
      lineup_revision_slots: [
        {
          player_user_id: setter.id,
          court_position: 3,
          is_libero: false,
          primary_position_snapshot: "setter",
        },
        {
          player_user_id: player.id,
          court_position: 4,
          is_libero: false,
          primary_position_snapshot: "outside_hitter",
        },
      ],
    } as Revision;
    const original = structuredClone(revision);
    expect(initialLineup(revision, [player, setter])).toEqual({
      setterPosition: 3,
      selection: { setter: setter.id, k1: player.id },
      needsReview: false,
    });
    expect(revision).toEqual(original);
    expect(Object.keys(lineupRoles)).toHaveLength(7);
  });
});
