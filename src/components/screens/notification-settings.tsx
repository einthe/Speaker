"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { notificationTriggers } from "@/lib/domain";
import type { NotificationSettings as Settings, NotificationRule } from "@/lib/cache/contract";
import { PageHeading } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { testNotificationSample } from "@/lib/test-notifications";

const groups = [
  {
    title: "Innlegg",
    description:
      "Godkjente medlemmer varsles, unntatt den som publiserer. Velg verv ved publisering for å varsle som ansvarsrolle.",
    keys: Object.keys(notificationTriggers).filter(
      (k) =>
        k.startsWith("post_by_") ||
        ["normal_post_created", "role_context_post_created", "lineup_published"].includes(k),
    ),
  },
  {
    title: "Hendelser",
    description:
      "Godkjente medlemmer varsles, unntatt den som oppretter hendelsen. Verv følger hendelsestypen; trenerens hendelser følger trenerregelen. Type- og roleregler kan kombineres.",
    keys: Object.keys(notificationTriggers).filter(
      (k) =>
        k.startsWith("event_by_") ||
        [
          "match_created",
          "match_updated",
          "practice_created",
          "practice_updated",
          "social_event_created",
          "travel_event_created",
          "team_logistics_event_created",
          "finance_event_created",
          "volunteer_event_created",
          "other_event_created",
        ].includes(k),
    ),
  },
  {
    title: "Kommentarer og reaksjoner",
    description:
      "Kommentarer og reaksjoner varsler forfatteren av innlegget eller hendelsen. Svar varsler den du svarer. Egne handlinger gir ikke varsel.",
    keys: [
      "post_comment_created",
      "event_comment_created",
      "comment_reply_created",
      "post_reaction_created",
      "event_reaction_created",
    ],
  },
  {
    title: "Personlige varsler",
    description: "Sendes bare til personen det gjelder.",
    keys: ["volunteer_assignment_created", "fine_received", "volunteer_points_changed"],
  },
];
export default function NotificationSettings() {
  const { scope, profile } = useTeam();
  const query = useQuery({
    ...queries.rules(scope),
    enabled: profile.base_role === "admin",
    refetchInterval: 15000,
  });
  return (
    <QueryState query={query} title="Innstillingene kunne ikke hentes">
      {(data) => <SettingsView data={data} />}
    </QueryState>
  );
}
function Rule({
  rule,
  onChange,
}: {
  rule: NotificationRule;
  onChange: (rule: NotificationRule) => void;
}) {
  const { pending } = useFormStatus();
  const label = notificationTriggers[rule.trigger_key as keyof typeof notificationTriggers];
  return (
    <div className="notification-rule">
      <input type="hidden" name="trigger_key" value={rule.trigger_key} />
      <strong>{label}</strong>
      <label className="toggle-label">
        <input
          type="checkbox"
          role="switch"
          name={`enabled:${rule.trigger_key}`}
          disabled={pending}
          aria-label={`${label} – I appen`}
          checked={rule.enabled}
          onChange={(event) => onChange({ ...rule, enabled: event.target.checked })}
        />
        <span>I appen</span>
      </label>
      <label className="toggle-label">
        <input
          type="checkbox"
          role="switch"
          name={`email_enabled:${rule.trigger_key}`}
          disabled={pending}
          aria-label={`${label} – E-post`}
          checked={rule.email_enabled}
          onChange={(event) => onChange({ ...rule, email_enabled: event.target.checked })}
        />
        <span>E-post</span>
      </label>
    </div>
  );
}
function RuleGroup({
  group,
  rules,
}: {
  group: (typeof groups)[number];
  rules: NotificationRule[];
}) {
  const [drafts, setDrafts] = useState<Record<string, NotificationRule>>({});
  return (
    <section className="card notification-settings" aria-label={group.title}>
      <h2>{group.title}</h2>
      <p className="muted">{group.description}</p>
      <ActionForm
        className="notification-rules-form"
        preserveValues
        onSuccess={() => setDrafts({})}
      >
        <input type="hidden" name="action" value="notification-rules" />
        <div>
          {rules.map((rule) => (
            <Rule
              key={rule.trigger_key}
              rule={drafts[rule.trigger_key] ?? rule}
              onChange={(value) =>
                setDrafts((current) => ({ ...current, [value.trigger_key]: value }))
              }
            />
          ))}
        </div>
        <div className="button-row">
          <Submit>Lagre endringer</Submit>
        </div>
      </ActionForm>
    </section>
  );
}
function SettingsView({ data }: { data: Settings }) {
  return (
    <>
      <PageHeading
        title="Varselinnstillinger"
        description="Velg hvilke aktiviteter som varsles i appen og på e-post."
      />
      <p className="message info">
        Innstillingene gjelder nye aktiviteter. Flere regler kan gjelde samme aktivitet; mottakeren
        får maksimalt ett varsel per kanal. E-post er avslått for alle regler fra start.
      </p>
      <section className="card notification-delivery" aria-label="E-postlevering">
        <h2>E-postlevering</h2>
        <p>
          {data.delivery.mode === "preview"
            ? "Lokal demo: e-poster forhåndsvises her og sendes ikke."
            : data.delivery.configured
              ? "Resend er konfigurert."
              : "E-postlevering er ikke aktivert eller ferdig konfigurert."}
        </p>
        {!data.delivery.configured && (
          <p className="muted">
            Sett NOTIFICATION_EMAIL_MODE=resend på serveren.
            {data.delivery.missing.length > 0 && ` Mangler: ${data.delivery.missing.join(", ")}.`}
          </p>
        )}
        <p className="muted">
          I kø: {data.queue.pending} ·{" "}
          {data.delivery.mode === "preview" ? "Forhåndsvist" : "Sendt til Resend"}:{" "}
          {data.queue.sent} · Feilet: {data.queue.failed}
        </p>
        {data.queue.failed > 0 && (
          <p className="message error">
            Noen e-poster kunne ikke sendes. Kontroller Resend og serveroppsettet.
          </p>
        )}
        {data.queue.recent.length > 0 && (
          <details>
            <summary>Siste e-postvarsler</summary>
            {data.queue.recent.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>
                  {item.full_name} ·{" "}
                  {
                    (
                      {
                        pending: "I kø",
                        sending: "Behandles",
                        sent:
                          data.delivery.mode === "preview" ? "Forhåndsvist" : "Sendt til Resend",
                        cancelled: "Avbrutt",
                        failed: "Feilet",
                      } as Record<string, string>
                    )[item.status]
                  }
                </p>
                <p className="muted">{item.body}</p>
              </article>
            ))}
          </details>
        )}
      </section>
      <TestEmail data={data} />
      {groups.map((group) => (
        <RuleGroup
          key={group.title}
          group={group}
          rules={data.rules.filter((rule) => group.keys.includes(rule.trigger_key))}
        />
      ))}
    </>
  );
}

function TestEmail({ data }: { data: Settings }) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [trigger, setTrigger] = useState<keyof typeof notificationTriggers>("post_by_coach");
  const sample = testNotificationSample(trigger);
  const preview = data.delivery.mode === "preview";
  const recipients = data.queue.recipients;
  return (
    <section
      className="card notification-delivery notification-test"
      aria-label="Test e-postvarsel"
    >
      <h2>Test e-postvarsel</h2>
      <p className="muted">
        Simuler et varsel til ett godkjent medlem med bekreftet e-postadresse. Testen fungerer selv
        om e-post er slått av for varseltypen. Den oppretter ingen aktivitet eller varsler i appen.
      </p>
      {!requestId ? (
        <button
          type="button"
          className="button secondary"
          disabled={!data.delivery.configured || !recipients.length}
          onClick={() => setRequestId(crypto.randomUUID())}
        >
          Ny test
        </button>
      ) : (
        <ActionForm preserveValues onSuccess={() => setRequestId(crypto.randomUUID())}>
          <input type="hidden" name="action" value="test-notification-email" />
          <input type="hidden" name="request_id" value={requestId} />
          <label>
            Mottaker
            <select
              name="user_id"
              required
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setRequestId(crypto.randomUUID());
              }}
            >
              <option value="">Velg medlem</option>
              {recipients.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} · {user.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Varseltype
            <select
              name="trigger_key"
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value as keyof typeof notificationTriggers);
                setRequestId(crypto.randomUUID());
              }}
            >
              {groups.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {notificationTriggers[key as keyof typeof notificationTriggers]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="message info" aria-label="Forhåndsvisning av testvarsel">
            <div>
              <strong>[TEST] {sample.title}</strong>
              <p>
                Dette er en test fra administrator. Ingen aktivitet eller endring er registrert.
                Eksempel: {sample.body}
              </p>
            </div>
          </div>
          <p className="muted">
            {preview
              ? "Lokal demo: Testen forhåndsvises uten å sende e-post."
              : "Sender én ekte e-post merket [TEST] til valgt mottaker. Lenken åpner den relevante delen av lagrommet."}
          </p>
          <div className="button-row">
            <Submit
              disabled={
                !data.delivery.configured || !recipients.some((user) => user.id === recipient)
              }
            >
              {preview ? "Forhåndsvis test" : "Send testvarsel"}
            </Submit>
            <button type="button" className="button secondary" onClick={() => setRequestId(null)}>
              Lukk
            </button>
          </div>
        </ActionForm>
      )}
      {!recipients.length && (
        <p className="muted">Ingen godkjente medlemmer med bekreftet e-postadresse.</p>
      )}
    </section>
  );
}
