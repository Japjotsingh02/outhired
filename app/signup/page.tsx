"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthSplit } from "@/components/AuthSplit";
import { FieldError } from "@/components/ui";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit({ name, email, password }: SignupValues) {
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong");
      return;
    }

    await signIn("credentials", { email, password, redirect: false });
    router.push("/");
    router.refresh();
  }

  return (
    <AuthSplit
      kicker="OutHired"
      title={
        <>
          Turn application
          <br />
          history into
          <br />
          useful signal.
        </>
      }
      subtitle="For software engineers and tech professionals who want a clearer read on what happens after they apply."
      footer="Your profile stays under your control."
    >
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Create your account
      </p>
      <h2
        className="editorial"
        style={{ fontSize: 36, lineHeight: 1.1, marginBottom: 12 }}
      >
        Create your
        <br />
        OutHired account
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
        Start with the applications you already have in motion.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="field-label" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            className="input"
            type="text"
            placeholder="Alex Morgan"
            autoFocus
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <label className="field-label" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <label className="field-label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="input"
            type="password"
            placeholder="Min 8 characters"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: 13, borderLeft: "2px solid var(--red)", paddingLeft: 10 }}>
            {error}
          </p>
        )}

        <button id="signup-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p
        style={{
          marginTop: 24,
          fontSize: 13,
          color: "var(--text-secondary)",
          borderLeft: "2px solid var(--accent)",
          paddingLeft: 12,
          lineHeight: 1.5,
        }}
      >
        OutHired uses your profile only for the comparisons you choose. You can edit, export, or remove your data at any time.
      </p>

      <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Log in
        </Link>
      </p>
    </AuthSplit>
  );
}
