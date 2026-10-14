"use client";

import { useEffect, useRef } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { getQueryClient } from "@/lib/queries/queryClient";

/** Empties the query cache on sign-out and when a different user signs in, so data never leaks across users. */
function ClearCacheOnUserChange() {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  // undefined until the first settled session, so the initial load never clears anything.
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;
    if (previous.current !== undefined && previous.current !== userId) queryClient.clear();
    previous.current = userId;
  }, [status, userId, queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ClearCacheOnUserChange />
        {children}
        {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            duration: 5000,
            style: {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 2,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  );
}
