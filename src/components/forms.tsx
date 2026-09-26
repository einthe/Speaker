"use client";
import { useActionState, useState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, LoaderCircle } from "lucide-react";
import { mutate } from "@/server/actions";
import { authAction, type ActionState } from "@/server/auth-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClientContext } from "@tanstack/react-query";
import { TeamContext } from "./team-provider";
import { invalidateChange } from "@/lib/cache/queries";
import { leaveAuthContext } from "@/lib/cache/auth-events";
export function Submit({
  children = "Lagre endringer",
  secondary = false,
  disabled = false,
  name,
  value,
}: {
  children?: ReactNode;
  secondary?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`button ${secondary ? "secondary" : ""}`}
      disabled={pending || disabled}
      name={name}
      value={value}
    >
      {pending ? (
        <>
          <LoaderCircle size={17} className="spin" /> Lagrer …
        </>
      ) : (
        children
      )}
    </button>
  );
}
export function ActionForm({
  children,
  className,
  auth = false,
  onSuccess,
  submitAction,
  preserveValues = false,
}: {
  children: ReactNode;
  className?: string;
  auth?: boolean;
  onSuccess?: () => void;
  submitAction?: (previous: ActionState, form: FormData) => Promise<ActionState>;
  preserveValues?: boolean;
}) {
  const router = useRouter();
  const client = useContext(QueryClientContext);
  const access = useContext(TeamContext);
  const [state, action] = useActionState<ActionState, FormData>(async (previous, form) => {
    const result = await (submitAction ?? (auth ? authAction : mutate))(previous, form);
    if (auth && result.destination) {
      leaveAuthContext(result.destination);
      return result;
    }
    if (client && access && result.change) {
      try {
        await invalidateChange(client, access.scope, result.change);
      } catch {
        /* QueryState retains data and offers a retry. The write already succeeded. */
      }
    }
    if (result.destination) router.push(result.destination);
    if (result.success) onSuccess?.();
    return result;
  }, {});
  return (
    <form
      action={action}
      className={className ?? "form-stack"}
      onReset={preserveValues ? (event) => event.preventDefault() : undefined}
    >
      {children}
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.savedPostId && (
        <Link className="inline-link" href={`/posts/${state.savedPostId}/edit`}>
          Åpne det lagrede innlegget
        </Link>
      )}
      {state.success && (
        <p className="message success" role="status">
          <Check size={16} /> {state.success}
        </p>
      )}
    </form>
  );
}
export function DeleteButton({
  action,
  id,
  label,
  message,
}: {
  action: string;
  id: string;
  label: string;
  message?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button type="button" className="text-button danger" onClick={() => setConfirm(true)}>
        {label}
      </button>
    );
  return (
    <div className="confirm-delete">
      <p>{message ?? "Vil du slette dette? Handlingen kan ikke angres."}</p>
      <ActionForm>
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="id" value={id} />
        <div className="button-row">
          <Submit>Ja, {label.toLowerCase()}</Submit>
          <button type="button" className="button secondary" onClick={() => setConfirm(false)}>
            Avbryt
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
