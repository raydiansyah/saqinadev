"use client";

import { ErrorState } from "@/components/app/error-state";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState reset={reset} digest={error.digest} />;
}
