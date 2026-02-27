"use client";

import { Toaster } from "@/components/ui/toaster";

export default function ClientBody({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="antialiased">
      {children}
      <Toaster />
    </div>
  );
}
