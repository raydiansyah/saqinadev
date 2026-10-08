"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import type { ResolvedNavLink } from "./nav-links";

interface MobileNavProps {
  links: ResolvedNavLink[];
  labels: { open: string; close: string; nav: string; start: string; signIn: string };
}

/** Disclosure menu below desktop width. Closes on Escape, link click or resize to desktop. */
export function MobileNav({ links, labels }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => desktop.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={buttonVariants({ variant: "ghost", className: "w-11 px-0" })}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        <span className="sr-only">{open ? labels.close : labels.open}</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-border bg-background px-5 pb-6"
      >
        <nav aria-label={labels.nav}>
          <ul className="flex flex-col py-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-border text-base text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <LanguageSwitcher className="mt-3 sm:hidden" />
        <Link
          href="/dashboard/new"
          onClick={() => setOpen(false)}
          className={buttonVariants({ className: "mt-4 w-full" })}
        >
          {labels.start}
        </Link>
        <Link
          href="/sign-in"
          onClick={() => setOpen(false)}
          className={buttonVariants({ variant: "outline", className: "mt-2 w-full" })}
        >
          {labels.signIn}
        </Link>
      </div>
    </div>
  );
}
