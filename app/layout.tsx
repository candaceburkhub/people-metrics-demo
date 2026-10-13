import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";

export const metadata: Metadata = {
  title: "People Metrics Demo",
  description: "One metrics layer over mock Rippling and Ashby APIs, with an HR report, a leadership report and a role-scoped MCP server. Synthetic data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <nav className="top">
            <Link href="/" className="brand">People Metrics Demo</Link>
            <NavLinks />
            <span className="demo">Synthetic data</span>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
