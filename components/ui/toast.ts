"use client";

import { toast } from "sonner";
import { getErrorMessage } from "@/lib/apiClient";

export const ERROR_TOAST_MS = 8000;

/** Error toast for a quick action that failed. Lasts 8 seconds; offers Retry when given one. */
export function toastError(err: unknown, options: { retry?: () => void } = {}) {
  toast.error(getErrorMessage(err), {
    duration: ERROR_TOAST_MS,
    ...(options.retry && { action: { label: "Retry", onClick: options.retry } }),
  });
}

/** Neutral note, for example "That job is already in your list". */
export function toastInfo(message: string) {
  toast.info(message);
}
