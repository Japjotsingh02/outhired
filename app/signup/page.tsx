"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthSplit } from "@/components/AuthSplit";
import { AuthFormError, AuthNote, AuthSwitchLink, AuthTextField } from "@/components/AuthFields";
import { fieldErrorsFromApiError, getErrorMessage } from "@/lib/apiClient";
import { useSignup } from "@/lib/queries/auth";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type SignupValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignup();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError: setFieldError,
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit({ name, email, password }: SignupValues) {
    setError("");
    try {
      await signup.mutateAsync({ name, email, password });
    } catch (err) {
      // Field problems (taken email, short password) go on the field; the form shows the rest.
      const fields = fieldErrorsFromApiError(err);
      let placed = false;
      for (const field of ["name", "email", "password"] as const) {
        if (fields[field]) {
          setFieldError(field, { message: fields[field] });
          placed = true;
        }
      }
      if (!placed) setError(getErrorMessage(err));
      return;
    }

    // The account exists now; if signing in fails the login page is the next step.
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        router.push("/login");
        return;
      }
    } catch (err) {
      console.error("[signup] Automatic sign-in failed:", err);
      router.push("/login");
      return;
    }
    router.push("/profile?welcome=1");
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
        <AuthTextField
          id="name"
          label="Full name"
          type="text"
          placeholder="Alex Morgan"
          autoFocus
          registration={register("name")}
          error={errors.name?.message}
        />

        <AuthTextField
          id="signup-email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          registration={register("email")}
          error={errors.email?.message}
        />

        <AuthTextField
          id="signup-password"
          label="Password"
          type="password"
          placeholder="Min 8 characters"
          registration={register("password")}
          error={errors.password?.message}
        />

        <AuthFormError message={error} />

        <button id="signup-submit" type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <AuthNote marginTop={24}>
        OutHired uses your profile only for the comparisons you choose. You can edit, export, or remove your data at any time.
      </AuthNote>

      <AuthSwitchLink prompt="Already have an account?" href="/login" linkText="Log in" marginTop={16} />
    </AuthSplit>
  );
}
