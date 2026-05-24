"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Upload" },
    { href: "/review", label: "Pending Review" },
    { href: "/history", label: "History" },
  ];

  return (
    <div className="w-[280px] bg-[#161b22] border-r border-[#30363d] flex flex-col p-4 shrink-0">
      <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-8">
        MCP MATCHER
      </h1>

      <nav className="flex flex-col gap-2">
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
  );
}
