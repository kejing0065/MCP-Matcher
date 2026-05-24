/**
 * Global upload progress store — module-level so it survives navigation.
 * Components subscribe to changes via listeners.
 */
export type UploadPhase = "extracting" | "parsing" | "reconciling" | "done" | "error";

export interface UploadProgress {
  phase: UploadPhase;
  error?: string;
  invoiceName?: string;
  matchResultId?: string;
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
