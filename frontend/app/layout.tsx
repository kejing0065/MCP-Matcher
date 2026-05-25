import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reconciliation Dashboard",
  description: "AI-powered bank reconciliation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="flex flex-col bg-[#0d1117] text-white min-h-screen">
          <Sidebar />
          <div className="flex-1 overflow-auto flex flex-col bg-[#0d1117]">
             <main className="flex-1 p-6">
                {children}
             </main>
          </div>
        </div>
      </body>
    </html>
  );
}
