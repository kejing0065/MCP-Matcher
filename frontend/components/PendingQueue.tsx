"use client";

import type { MatchResult } from "@/lib/types";

interface PendingQueueProps {
  pending: MatchResult[];
  active?: MatchResult | null;
  onSelect: (result: MatchResult) => void;
  autoMatched: MatchResult[];
  upload?: { phase: string; invoiceName?: string } | null;
}

export default function PendingQueue({ pending, active, onSelect, autoMatched, upload }: PendingQueueProps) {
  const isUploading = upload && upload.phase !== "done" && upload.phase !== "error";

  return (
    <div className="flex flex-col gap-6 w-[320px] shrink-0">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-2">
          {autoMatched.length === 0 ? "Review Queue" : "Pending Review"} — {pending.length} case{pending.length !== 1 ? "s" : ""}
        </div>
        
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden divide-y divide-[#30363d] shadow-sm">
          {isUploading && (
            <div className="w-full text-left p-4 flex items-center gap-3 border-l-2 bg-[#0d1117] border-l-blue-500 transition-colors">
               <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate break-all flex items-center gap-2">
                     <span className="w-3.5 h-3.5 border-2 border-neutral-700 border-t-blue-500 rounded-full animate-spin"></span>
                     Processing
                  </div>
                  <div className="text-xs text-neutral-400 truncate mt-1">
                     {upload.invoiceName || "Uploading..."} 
                     {upload.phase === "extracting" && " (Extracting)"}
                     {upload.phase === "parsing" && " (Parsing)"}
                     {upload.phase === "reconciling" && " (Agent Analyzing)"}
                  </div>
               </div>
            </div>
          )}

          {pending.length === 0 && !isUploading ? (
            <div className="p-6 text-center">
              <div className="text-sm text-neutral-400">No pending cases</div>
            </div>
          ) : (
            pending.map((result) => {
              const isActive = active?.id === result.id;
              const isProcessing = result.status !== "matched" && !result.exception_explanation;
              const invoice = result.invoice;
              const conf = result.confidence || 0;
              
              const confClass = 
                conf >= 85 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                conf >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                "bg-red-500/10 text-red-400 border-red-500/20";

              return (
                <button
                  key={result.id}
                  onClick={() => !isProcessing && onSelect(result)}
                  disabled={isProcessing}
                  className={`w-full text-left p-4 flex items-center gap-3 transition-colors border-l-2 ${
                    isActive && !isUploading
                      ? "bg-[#0d1117] border-l-blue-500" 
                      : "border-l-transparent hover:bg-[#21262d]"
                  } ${isProcessing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate break-all">
                      {invoice?.invoice_no || "INV-????"}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">
                      {invoice?.customer || "Unknown"}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-xs text-neutral-300">
                      {invoice?.currency} {invoice?.amount?.toFixed(2)}
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${confClass}`}>
                      {Math.round(conf)}%
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {autoMatched.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-500/70 font-bold mb-2 flex items-center gap-2">
            Auto-Matched Today
            <span className="bg-emerald-500/10 text-emerald-400 py-0.5 px-1.5 rounded-full text-[10px]">{autoMatched.length}</span>
          </div>
          
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden divide-y divide-[#30363d] shadow-sm opacity-80">
             {autoMatched.map((result) => {
                const isActive = active?.id === result.id && !isUploading;
                const invoice = result.invoice;
                
                return (
                  <button
                    key={result.id}
                    onClick={() => onSelect(result)}
                    className={`w-full text-left p-3 flex items-center gap-3 transition-colors border-l-2 ${
                      isActive 
                        ? "bg-[#0d1117] border-l-blue-500" 
                        : "border-l-transparent hover:bg-[#21262d]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {invoice?.invoice_no || "INV-????"}
                      </div>
                      <div className="text-xs text-neutral-400 truncate">
                        {invoice?.customer || "Unknown"}
                      </div>
                    </div>
                    
                    <div className="text-emerald-500 text-sm">
                      ✓
                    </div>
                  </button>
                );
             })}
          </div>
        </div>
      )}
    </div>
  );
}
