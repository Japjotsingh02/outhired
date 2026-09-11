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

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email")),
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit({ email, password }: LoginValues) {
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthSplit
      kicker="OutHired · Account access"
      title={
        <>
          Welcome back to
          <br />
          OutHired
        </>
      }
      subtitle="Your application trail is waiting where you left it."
    >
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Log in
      </p>
      <h2
        className="editorial"
        style={{ fontSize: 36, lineHeight: 1.1, marginBottom: 28 }}
      >
        Continue to your
        <br />
        search
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="you@example.com"
            autoFocus
            {...register("email")}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            placeholder="••••••••"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        {error && (
          <p style={{ color: "var(--red)", fontSize: 13, borderLeft: "2px solid var(--red)", paddingLeft: 10 }}>
            {error}
          </p>
        )}

        <button id="login-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Log in"}
        </button>
      </form>

      <p
        style={{
          marginTop: 28,
          fontSize: 13,
          color: "var(--text-secondary)",
          borderLeft: "2px solid var(--accent)",
          paddingLeft: 12,
          lineHeight: 1.5,
        }}
      >
        Your account is private by default. OutHired shows only the information you choose to use.
      </p>

      <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-muted)" }}>
        New to OutHired?{" "}
        <Link href="/signup" style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Create an account
        </Link>
      </p>
    </AuthSplit>
  );
}
