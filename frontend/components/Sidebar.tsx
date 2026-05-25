"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { subscribeUpload, type UploadProgress } from "@/lib/uploadStore";

export default function Sidebar() {
  const pathname = usePathname();
  const [upload, setUpload] = useState<UploadProgress | null>(null);

  useEffect(() => subscribeUpload(setUpload), []);

  const isUploading = upload && upload.phase !== "done" && upload.phase !== "error";

  const links = [
    { href: "/", label: "Upload" },
    { href: "/review", label: "Pending Review" },
    { href: "/history", label: "History" },
  ];

  return (
    <div className="flex flex-col">
      {/* Main Navbar */}
      <div className="w-full h-16 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-6 shrink-0 sticky top-0 z-50">
        
        {/* LOGO */}
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          MCP MATCHER
        </h1>

        {/* Navigation Links */}
        <nav className="flex items-center gap-4">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-md transition-colors text-sm ${
                  isActive
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "hover:bg-[#21262d] text-neutral-300"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        
      </div>

      {/* Progress Indicator Bar */}
      {isUploading && (
        <div className="w-full h-12 bg-blue-900/30 border-b border-blue-500/30 flex items-center px-6 sticky top-16 z-40">
          <div className="max-w-6xl mx-auto w-full flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-blue-300 truncate">
                  Analyzing files in progress...
                </p>
                {upload.invoiceNames && upload.invoiceNames.length > 0 && (
                  <p className="text-[11px] text-blue-200/70 truncate">
                    {upload.invoiceNames.join(", ")}
                  </p>
                )}
                {upload.invoiceName && !upload.invoiceNames && (
                  <p className="text-[11px] text-blue-200/70 truncate">{upload.invoiceName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-blue-200/70 flex-shrink-0">
              <span>
                {upload.phase === "extracting" && "🔍 Extracting"}
                {upload.phase === "parsing" && "📄 Parsing"}
                {upload.phase === "reconciling" && "⚙️ Matching"}
              </span>
              <span className="w-2.5 h-2.5 border-2 border-blue-300/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}