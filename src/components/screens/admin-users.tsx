"use client";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { dateLabel } from "@/lib/dates";
import { Avatar, Badge, EmptyState, PageHeading } from "@/components/ui";
import { AdminUserForm } from "@/components/admin-user-form";
import { PositionForm } from "@/components/roster";
const statuses = {
  pending: "Venter på godkjenning",
  approved: "Godkjent",
  rejected: "Avvist",
  disabled: "Deaktivert",
};
export default function AdminUsers() {
  const { scope, profile } = useTeam();
  const query = useQuery({ ...queries.users(scope), enabled: profile.base_role === "admin" });
  return (
    <QueryState query={query} title="Brukerne kunne ikke hentes">
      {({ users, players }) => <UsersView users={users} players={players} />}
    </QueryState>
  );
}
function UsersView({ users, players }: import("@/lib/cache/contract").AdminUsers) {
  return (
    <>
      <PageHeading title="Brukere og tilganger" />
      <div className="admin-stats">
        <div className="card">
          <strong>{users.filter((u) => u.account_status === "pending").length}</strong>
          <span>venter på godkjenning</span>
        </div>
        <div className="card">
          <strong>{users.filter((u) => u.account_status === "approved").length}</strong>
          <span>godkjente medlemmer</span>
        </div>
      </div>
      {!users.length && (
        <EmptyState title="Ingen forespørsler ennå">
          <p>Nye registreringer dukker opp her.</p>
        </EmptyState>
      )}
      <div className="admin-users">
        {[...users]
          .sort(
            (a, b) =>
              Number(b.account_status === "pending") - Number(a.account_status === "pending"),
          )
          .map((user) => {
            const player = players.find((p) => p.id === user.id);
            return (
              <details className="card admin-user" key={user.id}>
                <summary>
                  <Avatar name={user.full_name} />
                  <span className="admin-user-name">
                    <strong>{user.full_name}</strong>
                    <small>{user.email}</small>
                  </span>
                  <Badge
                    tone={
                      user.account_status === "pending"
                        ? "gold"
                        : user.account_status === "approved"
                          ? "green"
                          : "muted"
                    }
                  >
                    {statuses[user.account_status]}
                  </Badge>
                  <span className="muted">Behandle</span>
                </summary>
                <div className="admin-user-body">
                  <p className="field-hint">
                    Registrert {dateLabel(user.created_at)} · E-postadressen er bare synlig for
                    administrator.
                  </p>
                  <AdminUserForm user={user} player={player} />
                  {player && user.base_role === "player" && user.account_status === "approved" && (
                    <details className="position-editor">
                      <summary>Spillerposisjoner</summary>
                      <PositionForm player={player} />
                    </details>
                  )}
                </div>
              </details>
            );
          })}
      </div>
    </>
  );
}
