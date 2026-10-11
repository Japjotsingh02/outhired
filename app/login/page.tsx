"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/lib/apiClient";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { AuthSplit } from "@/components/AuthSplit";
import { AuthFormError, AuthNote, AuthSwitchLink, AuthTextField } from "@/components/AuthFields";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email")),
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

/** Shown after a 401 sent the user here (?reason=expired). */
function ExpiredNotice() {
  const reason = useSearchParams().get("reason");
  if (reason !== "expired") return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <InlineAlert variant="info">Please sign in again.</InlineAlert>
    </div>
  );
}

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
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
    } catch (err) {
      console.error("[login] Sign-in request failed:", err);
      setError(getErrorMessage("NETWORK"));
      return;
    }

    if (result?.error) {
      // Only a rejected login is "wrong credentials"; anything else is on our side.
      setError(result.error === "CredentialsSignin" ? "Invalid email or password. Check them and try again." : getErrorMessage("SERVICE_UNAVAILABLE"));
      return;
    }
    router.push("/post-login");
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

      <Suspense fallback={null}>
        <ExpiredNotice />
      </Suspense>

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <AuthTextField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoFocus
          registration={register("email")}
          error={errors.email?.message}
        />

        <AuthTextField
          id="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          registration={register("password")}
          error={errors.password?.message}
        />

        <AuthFormError message={error} />

        <button id="login-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Log in"}
        </button>
      </form>

      <AuthNote marginTop={28}>
        Your account is private by default. OutHired shows only the information you choose to use.
      </AuthNote>

      <AuthSwitchLink prompt="New to OutHired?" href="/signup" linkText="Create an account" marginTop={18} />
    </AuthSplit>
  );
}
