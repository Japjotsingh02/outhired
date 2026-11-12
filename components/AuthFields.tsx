"use client";

import Link from "next/link";
import type { HTMLInputTypeAttribute } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { FieldError } from "@/components/ui";
import { InlineAlert } from "@/components/ui/InlineAlert";

/** Labelled input with its validation message, wired to react-hook-form. */
export function AuthTextField({
  id,
  label,
  type,
  placeholder,
  autoFocus,
  registration,
  error,
}: {
  id: string;
  label: string;
  type: HTMLInputTypeAttribute;
  placeholder: string;
  autoFocus?: boolean;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        {...registration}
      />
      <FieldError message={error} />
    </div>
  );
}

/** Submit-level error shown above the form button. */
export function AuthFormError({ message }: { message: string }) {
  if (!message) return null;
  return <InlineAlert>{message}</InlineAlert>;
}

/** Privacy note shown under the form. */
export function AuthNote({ children, marginTop }: { children: React.ReactNode; marginTop: number }) {
  return (
    <p
      style={{
        marginTop,
        fontSize: 13,
        color: "var(--text-secondary)",
        borderLeft: "2px solid var(--accent)",
        paddingLeft: 12,
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

/** "New here? Create an account" style link between the login and signup pages. */
export function AuthSwitchLink({
  prompt,
  href,
  linkText,
  marginTop,
}: {
  prompt: string;
  href: string;
  linkText: string;
  marginTop: number;
}) {
  return (
    <p style={{ marginTop, fontSize: 13, color: "var(--text-muted)" }}>
      {prompt}{" "}
      <Link href={href} style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}>
        {linkText}
      </Link>
    </p>
  );
}
