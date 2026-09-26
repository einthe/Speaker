"use client";
import { Fragment, useState } from "react";
import { ViewLink } from "@/components/view-link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, ReceiptText, X } from "lucide-react";
import { queries } from "@/lib/cache/queries";
import {
  canManageFines,
  nok,
  nokInput,
  factorLabel,
  multipliedAmount,
  type FineMember,
  type FineType,
  type FineMultiplier,
  type Fines,
} from "@/lib/fines";
import { dateLabel } from "@/lib/dates";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { ActionForm, DeleteButton, Submit } from "@/components/forms";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { LinkedText } from "@/components/linked-text";

export default function FinesPage() {
  const { profile, roles, scope } = useTeam();
  const editable = canManageFines(profile, roles);
  const params = useSearchParams();
  const tab = params.get("tab") === "manage" ? "manage" : "table";
  const query = useQuery(queries.fines(scope));
  const tabs = [
    ["table", "Bøtetabell"],
    ["manage", "Bøter"],
  ];
  return (
    <>
      <PageHeading title="Bøter" />
      <nav className="filter-tabs" aria-label="Bøter">
        {tabs.map(([key, label]) => (
          <ViewLink
            key={key}
            href={key === "table" ? "/fines" : `/fines?tab=${key}`}
            className={tab === key ? "selected" : undefined}
            aria-current={tab === key ? "page" : undefined}
          >
            {label}
          </ViewLink>
        ))}
      </nav>
      <QueryState query={query} title="Bøtene kunne ikke hentes">
        {(data) =>
          tab === "table" ? (
            <FineTable data={data} editable={editable} viewerId={profile.id} />
          ) : (
            <FineTypes types={data.types} multipliers={data.multipliers} editable={editable} />
          )
        }
      </QueryState>
    </>
  );
}

function FineTable({
  data,
  editable,
  viewerId,
}: {
  data: Fines;
  editable: boolean;
  viewerId: string;
}) {
  if (!data.members.length)
    return (
      <div className="card">
        <EmptyState icon={<ReceiptText size={28} />} title="Ingen spillere eller trenere ennå">
          <p>Godkjente spillere og trenere vises her.</p>
        </EmptyState>
      </div>
    );
  return (
    <div className="card standings-scroll" role="region" aria-label="Bøtetabell" tabIndex={0}>
      <table className="standings-table fines-table">
        <caption className="sr-only">Spillere og trenere rangert etter samlet bøtebeløp</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Navn</th>
            <th scope="col">Totalt</th>
            {editable && (
              <th scope="col">
                <span className="sr-only">Legg til bot</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.members.map((member, index) => (
            <MemberRow
              key={member.id}
              member={member}
              rank={index + 1}
              own={member.id === viewerId}
              editable={editable}
              types={data.types}
              multipliers={data.multipliers}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({
  member,
  rank,
  own,
  editable,
  types,
  multipliers,
}: {
  member: FineMember;
  rank: number;
  own: boolean;
  editable: boolean;
  types: FineType[];
  multipliers: FineMultiplier[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const activeTypes = types.filter((type) => type.active);
  const detailsId = `fines-${member.id}`;
  return (
    <Fragment>
      <tr className={own ? "standings-team-highlight" : undefined} data-fine-member={member.id}>
        <td>{rank}</td>
        <th scope="row">
          <button
            type="button"
            className="fine-member-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              size={16}
              className={expanded ? "fine-chevron-open" : undefined}
              aria-hidden="true"
            />
            <span>
              {member.full_name}
              {own && <span className="sr-only"> (deg)</span>}
              <small className="muted">{member.base_role === "coach" ? "Trener" : "Spiller"}</small>
            </span>
          </button>
        </th>
        <td className="fine-total">{nok(member.total_ore)}</td>
        {editable && (
          <td>
            <button
              type="button"
              className="icon-button"
              aria-label={`Gi bot til ${member.full_name}`}
              onClick={() => {
                setExpanded(true);
                setRequestId(crypto.randomUUID());
              }}
            >
              <Plus size={18} />
            </button>
          </td>
        )}
      </tr>
      <tr id={detailsId} className="fine-detail-row" hidden={!expanded}>
        <td colSpan={editable ? 4 : 3}>
          {editable && requestId && (
            <div className="fine-assignment">
              <div className="section-title">
                <h2>Gi bot til {member.full_name}</h2>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Lukk registrering"
                  onClick={() => setRequestId(null)}
                >
                  <X size={18} />
                </button>
              </div>
              {activeTypes.length ? (
                <AssignFine
                  key={requestId}
                  id={requestId}
                  member={member}
                  types={activeTypes}
                  multipliers={multipliers.filter((item) => item.active)}
                  onSuccess={() => setRequestId(null)}
                />
              ) : (
                <p>
                  Opprett en aktiv bot under{" "}
                  <ViewLink className="inline-link" href="/fines?tab=manage">
                    Bøter
                  </ViewLink>{" "}
                  først.
                </p>
              )}
            </div>
          )}
          {member.fines.length ? (
            <ul className="fine-history" aria-label={`Bøter for ${member.full_name}`}>
              {member.fines.map((fine) => (
                <li key={fine.id} className={fine.cancelled_at ? "fine-cancelled" : undefined}>
                  <div className="fine-history-heading">
                    <strong>{fine.type_name_snapshot}</strong>
                    <span>{nok(fine.amount_ore)}</span>
                  </div>
                  {fine.multiplier_factor_snapshot !== 1 && (
                    <p className="muted">
                      {fine.multiplier_name_snapshot} · {nok(fine.base_amount_ore)} ×{" "}
                      {factorLabel(fine.multiplier_factor_snapshot)}
                    </p>
                  )}
                  <p className="muted">
                    {dateLabel(fine.created_at)} · {fine.issued_by_name_snapshot}
                  </p>
                  {fine.note && (
                    <p className="fine-text">
                      <LinkedText text={fine.note} />
                    </p>
                  )}
                  {fine.cancelled_at ? (
                    <Badge>Annullert</Badge>
                  ) : (
                    editable && (
                      <DeleteButton
                        action="cancel-fine"
                        id={fine.id}
                        label="Annuller bot"
                        message="Boten trekkes fra totalen og beholdes som annullert i historikken."
                      />
                    )
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Ingen bøter ennå.</p>
          )}
        </td>
      </tr>
    </Fragment>
  );
}

function AssignFine({
  id,
  member,
  types,
  multipliers,
  onSuccess,
}: {
  id: string;
  member: FineMember;
  types: FineType[];
  multipliers: FineMultiplier[];
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState(types[0].id);
  const [multiplierId, setMultiplierId] = useState("");
  const multiplier = multipliers.find((item) => item.id === multiplierId);
  const validMultiplier = !multiplierId || !!multiplier;
  const type = types.find((item) => item.id === selected);
  const total = type ? multipliedAmount(type.amount_ore, multiplier?.factor ?? 1) : 0;
  return (
    <ActionForm onSuccess={onSuccess}>
      <input type="hidden" name="action" value="fine" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="user_id" value={member.id} />
      <input type="hidden" name="expected_type_version" value={type?.version ?? ""} />
      <label>
        Bot
        <select
          name="fine_type_id"
          required
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {!type && <option value="">Velg en bot</option>}
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {nok(item.amount_ore)}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="expected_multiplier_version" value={multiplier?.version ?? ""} />
      <label>
        Ekstraregel
        <select
          name="multiplier_id"
          value={multiplierId}
          onChange={(event) => setMultiplierId(event.target.value)}
        >
          <option value="">Vanlig – 1×</option>
          {!validMultiplier && (
            <option value={multiplierId} disabled>
              Ekstraregelen er ikke tilgjengelig
            </option>
          )}
          {multipliers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} – {factorLabel(item.factor)}×
            </option>
          ))}
        </select>
      </label>
      {type && validMultiplier && <p role="status">Beløp: {nok(total)}</p>}
      <label>
        Merknad (valgfritt)
        <textarea name="note" maxLength={1000} rows={2} />
      </label>
      {type && validMultiplier && (total < 1 || total > 100000000) && (
        <p className="message error">Beløpet må være mellom 0,01 og 1 000 000 kr.</p>
      )}
      <Submit disabled={!type || !validMultiplier || total < 1 || total > 100000000}>Gi bot</Submit>
    </ActionForm>
  );
}

function FineTypes({
  types,
  multipliers,
  editable,
}: {
  types: FineType[];
  multipliers: FineMultiplier[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="fine-panels">
      <section className="card editor form-stack">
        <h2>Bøter</h2>
        {editable && (
          <>
            <button
              type="button"
              className="button secondary"
              aria-expanded={adding}
              aria-controls="new-fine-type"
              onClick={() => setAdding(!adding)}
            >
              {adding ? "Avbryt ny bot" : "Ny bot"}
            </button>
            {adding && (
              <div id="new-fine-type">
                <FineTypeForm onSuccess={() => setAdding(false)} />
              </div>
            )}
          </>
        )}
        {editable && types.length > 0 && (
          <p className="muted">
            Endringer gjelder nye bøter. Tidligere bøter beholder beløpet de ble gitt med.
          </p>
        )}
        {!types.length && <p className="muted">Ingen bøter opprettet ennå.</p>}
        {editable ? (
          types.map((type) => (
            <details key={type.id} className="fine-type-editor">
              <summary>
                {type.name} · {nok(type.amount_ore)}
                {!type.active && " · Inaktiv"}
              </summary>
              <FineTypeForm key={type.version} type={type} />
            </details>
          ))
        ) : (
          <ul className="fine-catalog">
            {types.map((type) => (
              <li key={type.id}>
                <div className="fine-history-heading">
                  <strong>{type.name}</strong>
                  <span>{nok(type.amount_ore)}</span>
                </div>
                {!type.active && <Badge>Inaktiv</Badge>}
                {type.description && (
                  <p className="fine-text muted">
                    <LinkedText text={type.description} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Multipliers multipliers={multipliers} editable={editable} />
    </div>
  );
}

function FineTypeForm({ type, onSuccess }: { type?: FineType; onSuccess?: () => void }) {
  return (
    <ActionForm onSuccess={onSuccess}>
      <input type="hidden" name="action" value="fine-type" />
      <input type="hidden" name="id" value={type?.id ?? ""} />
      <input type="hidden" name="expected_version" value={type?.version ?? 0} />
      <div className="form-grid">
        <label>
          Navn
          <input name="name" required maxLength={100} defaultValue={type?.name} />
        </label>
        <label>
          Beløp (kr)
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="50"
            defaultValue={type ? nokInput(type.amount_ore) : ""}
          />
        </label>
      </div>
      <label>
        Beskrivelse (valgfritt)
        <textarea name="description" maxLength={2000} rows={3} defaultValue={type?.description} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="active" defaultChecked={type?.active ?? true} />
        Aktiv
      </label>
      <Submit>{type ? "Lagre bot" : "Opprett bot"}</Submit>
    </ActionForm>
  );
}

function Multipliers({
  multipliers,
  editable,
}: {
  multipliers: FineMultiplier[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="card editor form-stack">
      <h2>Ekstraregler</h2>
      {editable && (
        <>
          <button
            type="button"
            className="button secondary"
            aria-expanded={adding}
            aria-controls="new-fine-multiplier"
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Avbryt ny ekstraregel" : "Ny ekstraregel"}
          </button>
          {adding && (
            <div id="new-fine-multiplier">
              <MultiplierForm onSuccess={() => setAdding(false)} />
            </div>
          )}
        </>
      )}
      {editable ? (
        multipliers.map((item) => (
          <details key={item.id} className="fine-type-editor">
            <summary>
              {item.name} · {factorLabel(item.factor)}×{!item.active && " · Inaktiv"}
            </summary>
            <MultiplierForm key={item.version} multiplier={item} />
          </details>
        ))
      ) : (
        <ul className="fine-catalog">
          {multipliers.map((item) => (
            <li key={item.id}>
              <div className="fine-history-heading">
                <strong>{item.name}</strong>
                <span>{factorLabel(item.factor)}×</span>
              </div>
              {!item.active && <Badge>Inaktiv</Badge>}
              {item.description && (
                <p className="fine-text muted">
                  <LinkedText text={item.description} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MultiplierForm({
  multiplier,
  onSuccess,
}: {
  multiplier?: FineMultiplier;
  onSuccess?: () => void;
}) {
  return (
    <ActionForm onSuccess={onSuccess}>
      <input type="hidden" name="action" value="fine-multiplier" />
      <input type="hidden" name="id" value={multiplier?.id ?? ""} />
      <input type="hidden" name="expected_version" value={multiplier?.version ?? 0} />
      <div className="form-grid">
        <label>
          Navn
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Kampdag"
            defaultValue={multiplier?.name}
          />
        </label>
        <label>
          Multiplikator
          <input
            name="factor"
            inputMode="decimal"
            required
            placeholder="1,5"
            defaultValue={multiplier ? factorLabel(multiplier.factor) : "2"}
          />
        </label>
      </div>
      <label>
        Beskrivelse (valgfritt)
        <textarea
          name="description"
          maxLength={2000}
          rows={2}
          defaultValue={multiplier?.description}
        />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="active" defaultChecked={multiplier?.active ?? true} />
        Aktiv
      </label>
      <Submit>{multiplier ? "Lagre ekstraregel" : "Opprett ekstraregel"}</Submit>
    </ActionForm>
  );
}
