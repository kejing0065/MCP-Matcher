/**
 * Global upload progress store — module-level so it survives navigation.
 * Components subscribe to changes via listeners.
 * 
 * Supports both single-invoice (S1) and multi-invoice (S2–S8) scenarios.
 */
import type { ScenarioType } from "./types";

export type UploadPhase =
  | "extracting"      // Extracting invoice(s) via Gemini/Groq
  | "parsing"         // Parsing bank CSV
  | "reconciling"     // Running match/group match
  | "done"            // All complete
  | "error";          // Failed

export interface UploadProgress {
  phase: UploadPhase;
  error?: string;
  // Single invoice info (for display)
  invoiceName?: string;
  // Multi-invoice support
  invoiceNames?: string[];       // All invoice filenames being processed
  invoiceCount?: number;         // Total number of invoices
  invoicesExtracted?: number;    // How many have been extracted so far
  // Results
  matchResultId?: string;        // For single-entity results
  groupId?: string;              // For multi-entity group results
  scenarioType?: ScenarioType;   // Detected scenario type after reconciliation
}

type Listener = (p: UploadProgress | null) => void;

let _state: UploadProgress | null = null;
const _listeners = new Set<Listener>();

export function getUploadProgress() { return _state; }

export function setUploadProgress(p: UploadProgress | null) {
  _state = p;
  _listeners.forEach(l => l(p));
}

export function subscribeUpload(l: Listener) {
  _listeners.add(l);
  return () => { _listeners.delete(l); };
}
