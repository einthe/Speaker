"use client";

import { useRef, useState, type CSSProperties } from "react";
import { LogOut, Minus, Plus, X, CalendarDays, Users, PanelLeft, PanelRight } from "lucide-react";
import { signOut } from "@/server/auth-actions";
import { dateLabel, localInput, toUTC } from "@/lib/dates";
import {
  announcementTeams,
  createMatch,
  setLibero,
  setStarter,
  type Match,
  type Team,
} from "@/lib/speaker/model";
import { buildSpeakerScript } from "@/lib/speaker/script";

function TeamEditor({ team, onChange }: { team: Team; onChange: (team: Team) => void }) {
  const count = team.players.filter((p) => p.starter).length;
  return (
    <section className="team-editor" aria-label={`Spillere ${team.name || "Motstander"}`}>
      <div className="panel-heading">
        <h3>{team.name || "Motstander"}</h3>
        <span className="selection-count" aria-label={`${count} av 6 startere`}>
          {count}/6
        </span>
      </div>
      <div className="roster-head" aria-hidden="true">
        <span>Nr.</span>
        <span>Spiller</span>
        <span title="Startsekser">6</span>
        <span title="Kaptein">K</span>
        <span title="Libero">L</span>
        <span />
      </div>
      {team.players.map((player) => (
        <div className={`roster-row ${player.starter ? "is-starter" : ""}`} key={player.id}>
          <input
            aria-label={`Nummer ${player.name || "spiller"}`}
            className="number-input"
            inputMode="numeric"
            maxLength={2}
            value={player.number}
            onChange={(e) =>
              onChange({
                ...team,
                players: team.players.map((p) =>
                  p.id === player.id ? { ...p, number: e.target.value.replace(/\D/g, "") } : p,
                ),
              })
            }
          />
          <input
            aria-label={`Navn spiller ${player.number || "uten nummer"}`}
            placeholder="Navn"
            value={player.name}
            maxLength={100}
            onChange={(e) =>
              onChange({
                ...team,
                players: team.players.map((p) =>
                  p.id === player.id ? { ...p, name: e.target.value } : p,
                ),
              })
            }
          />
          <input
            type="checkbox"
            aria-label={`Starter ${player.name || player.number}`}
            title="Startsekser"
            checked={player.starter}
            disabled={!player.starter && count >= 6}
            onChange={(e) => onChange(setStarter(team, player.id, e.target.checked))}
          />
          <button
            className="role-toggle"
            title="Kaptein"
            aria-label={`Kaptein ${player.name || player.number}`}
            aria-pressed={team.captainId === player.id}
            onClick={() =>
              onChange({ ...team, captainId: team.captainId === player.id ? "" : player.id })
            }
          >
            K
          </button>
          <button
            className="role-toggle"
            title="Libero"
            aria-label={`Libero ${player.name || player.number}`}
            aria-pressed={team.liberoId === player.id}
            onClick={() => onChange(setLibero(team, team.liberoId === player.id ? "" : player.id))}
          >
            L
          </button>
          <button
            className="remove-player"
            title="Fjern spiller"
            aria-label={`Fjern ${player.name || player.number}`}
            onClick={() =>
              onChange({
                ...team,
                players: team.players.filter((p) => p.id !== player.id),
                captainId: team.captainId === player.id ? "" : team.captainId,
                liberoId: team.liberoId === player.id ? "" : team.liberoId,
              })
            }
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        className="text-button add-player"
        onClick={() =>
          onChange({
            ...team,
            players: [
              ...team.players,
              { id: crypto.randomUUID(), number: "", name: "", starter: false },
            ],
          })
        }
      >
        <Plus size={14} /> Spiller
      </button>
      <label className="coach-field">
        Trener
        <input
          value={team.coach}
          placeholder="Navn"
          maxLength={100}
          onChange={(e) => onChange({ ...team, coach: e.target.value })}
        />
      </label>
    </section>
  );
}

export function Workspace({ initialMatches, demo }: { initialMatches: Match[]; demo: boolean }) {
  const [matches, setMatches] = useState(initialMatches);
  const [selectedId, setSelectedId] = useState(initialMatches[0]?.id ?? "");
  const [fontSize, setFontSize] = useState(22);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(true);
  const [teamsOpen, setTeamsOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"matches" | "teams" | null>(null);
  const reader = useRef<HTMLElement>(null);
  const match = matches.find((m) => m.id === selectedId);
  const teams = match ? announcementTeams(match) : [];
  const opponent = match?.teams.find((t) => !t.isNtnui);

  function updateMatch(change: Partial<Match>) {
    setMatches((current) => current.map((m) => (m.id === selectedId ? { ...m, ...change } : m)));
  }

  function updateTeam(team: Team) {
    if (!match) return;
    updateMatch({
      teams: match.teams.map((t) => (t.id === team.id ? team : t)) as Match["teams"],
      awardPlayerId:
        match.teams
          .find((t) => t.id === team.id)
          ?.players.some((p) => p.id === match.awardPlayerId) &&
        !team.players.some((p) => p.id === match.awardPlayerId)
          ? ""
          : match.awardPlayerId,
    });
  }

  function selectMatch(id: string) {
    setSelectedId(id);
    setDetailsOpen(false);
    setMobilePanel(null);
    reader.current?.scrollTo(0, 0);
  }

  function addMatch() {
    const next = createMatch(crypto.randomUUID(), new Date().toISOString());
    setMatches((current) => [...current, next]);
    setSelectedId(next.id);
    setDetailsOpen(true);
    setMobilePanel("teams");
    setTeamsOpen(true);
    reader.current?.scrollTo(0, 0);
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <span className="wordmark">
          NTNUI <span>speaker</span>
        </span>
        <div className="desktop-controls">
          <button
            aria-label="Kamper"
            title={matchesOpen ? "Skjul kamper" : "Vis kamper"}
            aria-expanded={matchesOpen}
            aria-controls="match-list"
            onClick={() => setMatchesOpen((open) => !open)}
          >
            <PanelLeft size={18} />
          </button>
          <button
            aria-label="Lag"
            title={teamsOpen ? "Skjul lag" : "Vis lag"}
            aria-expanded={teamsOpen}
            aria-controls="team-panel"
            onClick={() => setTeamsOpen((open) => !open)}
          >
            <PanelRight size={18} />
          </button>
        </div>
        <div className="mobile-controls">
          <button
            aria-label="Kamper"
            aria-expanded={mobilePanel === "matches"}
            aria-controls="match-list"
            onClick={() => setMobilePanel(mobilePanel === "matches" ? null : "matches")}
          >
            <CalendarDays size={18} />
          </button>
          <button
            aria-label="Lag"
            aria-expanded={mobilePanel === "teams"}
            aria-controls="team-panel"
            onClick={() => setMobilePanel(mobilePanel === "teams" ? null : "teams")}
          >
            <Users size={18} />
          </button>
        </div>
        <form action={signOut}>
          <button className="logout" title="Logg ut" aria-label="Logg ut">
            <LogOut size={17} />
          </button>
        </form>
      </header>

      <div
        className={`workspace-columns ${matchesOpen ? "" : "matches-collapsed"} ${teamsOpen ? "" : "teams-collapsed"}`}
      >
        <aside
          id="match-list"
          className={`match-sidebar ${mobilePanel === "matches" ? "panel-open" : ""}`}
          aria-label="Kommende kamper"
        >
          <div className="panel-heading">
            <h2>Kamper</h2>
            <button className="icon-button" onClick={addMatch} aria-label="Ny kamp" title="Ny kamp">
              <Plus size={18} />
            </button>
          </div>
          {demo && <span className="demo-label">Demokamper</span>}
          <nav className="fixture-list" aria-label="Velg kamp">
            {[...matches]
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
              .map((m) => (
                <button
                  key={m.id}
                  className={`fixture ${m.id === selectedId ? "selected" : ""}`}
                  aria-current={m.id === selectedId ? "true" : undefined}
                  onClick={() => selectMatch(m.id)}
                >
                  <span className="fixture-time">{dateLabel(m.scheduledAt, "d. MMM · HH:mm")}</span>
                  <strong>
                    NTNUI <span>–</span>
                    <br />
                    {m.teams.find((t) => !t.isNtnui)?.name || "Ny kamp"}
                  </strong>
                  {m.competition && <span className="fixture-competition">{m.competition}</span>}
                </button>
              ))}
          </nav>
          {!matches.length && (
            <button className="text-button" onClick={addMatch}>
              <Plus size={15} /> Legg til kamp
            </button>
          )}
          <small className="session-note">Kun i denne fanen · nullstilles ved omlasting</small>
        </aside>

        <main className="script-reader" ref={reader} aria-label="Manus" tabIndex={0}>
          {match ? (
            <>
              <div className="reader-toolbar">
                <div>
                  <h1>NTNUI – {opponent?.name || "[motstander]"}</h1>
                  <p>
                    {dateLabel(match.scheduledAt, "d. MMM · HH:mm")} · {match.venue || "[hall]"}
                  </p>
                </div>
                <div className="font-controls">
                  <button
                    aria-label="Mindre tekst"
                    disabled={fontSize <= 18}
                    onClick={() => setFontSize((n) => n - 2)}
                  >
                    <Minus size={15} />
                  </button>
                  <span aria-hidden="true">Aa</span>
                  <button
                    aria-label="Større tekst"
                    disabled={fontSize >= 34}
                    onClick={() => setFontSize((n) => n + 2)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
              <article
                className="script"
                style={{ "--script-size": `${fontSize}px` } as CSSProperties}
              >
                {buildSpeakerScript(match).map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className={section.instruction ? "stage-direction" : "script-section"}
                  >
                    <p>
                      {section.parts
                        ? section.parts.map((part, i) =>
                            part.dynamic ? <mark key={i}>{part.text}</mark> : part.text,
                          )
                        : section.text}
                    </p>
                  </section>
                ))}
                {match.notes && (
                  <section className="stage-direction">
                    <p>
                      <mark>{match.notes}</mark>
                    </p>
                  </section>
                )}
              </article>
            </>
          ) : (
            <div className="empty-workspace">
              <h1>Manus</h1>
              <button onClick={addMatch}>
                <Plus size={16} /> Ny kamp
              </button>
            </div>
          )}
        </main>

        <aside
          id="team-panel"
          className={`team-sidebar ${mobilePanel === "teams" ? "panel-open" : ""}`}
          aria-label="Lag og kampdetaljer"
        >
          {match && (
            <>
              <details
                className="match-details"
                key={match.id}
                open={detailsOpen}
                onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
              >
                <summary>Kampdetaljer</summary>
                <div className="details-fields">
                  <label>
                    Motstander
                    <input
                      value={opponent?.name ?? ""}
                      maxLength={100}
                      onChange={(e) =>
                        opponent && updateTeam({ ...opponent, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tidspunkt (Oslo)
                    <input
                      type="datetime-local"
                      defaultValue={localInput(match.scheduledAt)}
                      onChange={(e) => {
                        e.target.setCustomValidity("");
                        if (!e.target.value) return;
                        try {
                          updateMatch({ scheduledAt: toUTC(e.target.value) });
                        } catch {
                          e.target.setCustomValidity("Ugyldig tidspunkt i Oslo.");
                          e.target.reportValidity();
                        }
                      }}
                    />
                  </label>
                  <label>
                    Hall
                    <input
                      value={match.venue}
                      maxLength={100}
                      onChange={(e) => updateMatch({ venue: e.target.value })}
                    />
                  </label>
                  <label>
                    Klasse / serie
                    <input
                      value={match.competition}
                      maxLength={100}
                      onChange={(e) => updateMatch({ competition: e.target.value })}
                    />
                  </label>
                  <label>
                    Førstedommer
                    <input
                      value={match.firstReferee}
                      maxLength={100}
                      onChange={(e) => updateMatch({ firstReferee: e.target.value })}
                    />
                  </label>
                  <label>
                    Andredommer
                    <input
                      value={match.secondReferee}
                      maxLength={100}
                      onChange={(e) => updateMatch({ secondReferee: e.target.value })}
                    />
                  </label>
                </div>
              </details>
              {teams.map((team) => (
                <TeamEditor key={team.id} team={team} onChange={updateTeam} />
              ))}
              <div className="extra-fields">
                <label>
                  Banens beste
                  <select
                    value={match.awardPlayerId}
                    onChange={(e) => updateMatch({ awardPlayerId: e.target.value })}
                  >
                    <option value="">Velg spiller</option>
                    {teams.map((team) => (
                      <optgroup key={team.id} label={team.name || "Motstander"}>
                        {team.players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.number || "–"} · {p.name || "[navn]"}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  Notater
                  <textarea
                    rows={3}
                    value={match.notes}
                    onChange={(e) => updateMatch({ notes: e.target.value })}
                  />
                </label>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
