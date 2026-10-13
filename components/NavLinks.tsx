"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks() {
  const path = usePathname();
  const item = (href: string, label: string) => (
    <Link href={href} className={`navbtn${path === href ? " active" : ""}`} aria-current={path === href ? "page" : undefined}>{label}</Link>
  );
  return <>{item("/hr", "HR Overview")}{item("/leadership", "Leadership Report")}</>;
}
