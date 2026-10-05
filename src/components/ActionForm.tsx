"use client";

import { createContext, startTransition, useActionState, useContext, type ReactNode } from "react";
import type { ActionState } from "@/app/actions";

const PendingContext = createContext(false);

/**
 * Formulário ligado a uma server action que devolve { error }.
 * Envia via onSubmit (e não via `action`) de propósito: o React 19 limpa os
 * campos do formulário depois de uma action, e aqui o cidadão não pode perder
 * a foto e o ponto marcado no mapa só porque um campo deu erro.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <PendingContext.Provider value={pending}>
      <form
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        {children}
        {state.error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="mt-3 rounded-lg bg-st-ok-bg px-3 py-2 text-sm font-medium text-st-ok">
            {state.ok}
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingText = "Enviando…",
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const pending = useContext(PendingContext);
  const styles = {
    primary: "bg-brand text-ink hover:brightness-95",
    secondary: "border border-line bg-white text-ink hover:bg-canvas",
    danger: "border border-danger text-danger hover:bg-danger-bg",
  }[variant];

  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-12 rounded-xl px-5 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
