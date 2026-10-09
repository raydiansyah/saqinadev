"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
