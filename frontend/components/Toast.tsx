"use client";

import { useEffect, useState } from "react";
import type { ToastProps } from "@/lib/types";

let _listeners: ((t: ToastProps | null) => void)[] = [];

export function showToast(props: ToastProps) {
  const p = { duration: 3000, ...props };
  _listeners.forEach(l => l(p));
  setTimeout(() => _listeners.forEach(l => l(null)), p.duration);
}

export default function Toast() {
  const [toast, setToast] = useState<ToastProps | null>(null);

  useEffect(() => {
    _listeners.push(setToast);
    return () => { _listeners = _listeners.filter(l => l !== setToast); };
  }, []);

  if (!toast) return null;

  const classes =
    toast.type === "success" ? "bg-green-950/90 border-green-800/80 text-green-400" :
    toast.type === "error"   ? "bg-red-950/90 border-red-800/80 text-red-400" : 
                               "bg-blue-950/90 border-blue-800/80 text-blue-400";
  
  const icon =
    toast.type === "success" ? "✓" :
    toast.type === "error"   ? "✕" : "ℹ";

  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-semibold shadow-lg shadow-black/20 animate-fade-up ${classes}`}>
      <span className="font-bold text-sm">{icon}</span>
      <span>{toast.message}</span>
    </div>
  );
}
