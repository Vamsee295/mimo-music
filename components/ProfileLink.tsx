"use client";
// The profile button, top right of a page on phones (the bottom bar keeps Home · New · Library · Search).
// Hidden on the account and settings pages themselves, and on desktop, where the sidebar has Account.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLibrary } from "@/lib/library";
import { Icon } from "./Icon";

export function ProfileLink({ className = "" }: { className?: string }) {
  const name = useLibrary((s) => s.name);
  const path = usePathname();
  if (path.startsWith("/account") || path.startsWith("/settings") || path.startsWith("/replay")) return null;
  return (
    <Link
      href="/account"
      aria-label="Your account"
      className={`tap grid size-10 shrink-0 place-items-center rounded-full border-[2.4px] border-[var(--ink)] bg-accent font-display text-[17px] text-paper shadow-[2px_3px_0_var(--hard)] md:hidden ${className}`}
    >
      {name ? name[0].toUpperCase() : <Icon name="user" className="size-5" />}
    </Link>
  );
}
