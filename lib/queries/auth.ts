"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface SignupVariables {
  name: string;
  email: string;
  password: string;
}

/** POST /api/auth/signup. Sign-in afterwards stays with NextAuth's signIn. */
export function useSignup() {
  return useMutation({
    mutationFn: (body: SignupVariables) =>
      apiFetch<{ id: string; email: string; name: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
