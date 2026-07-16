"use client";

import { Toaster } from "@/components/ui/toaster";
import AppShell from "@/components/AppShell";

export default function ClientBody({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="antialiased">
      <AppShell>{children}</AppShell>
      <Toaster />
    </div>
  );
}
