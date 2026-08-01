import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Deliberate lint error (F-01 Phase 4): proves deploy.yml stops at lint before
// wrangler ever runs. Reverted in the very next commit.
const deployGateProbe = "unused on purpose";
