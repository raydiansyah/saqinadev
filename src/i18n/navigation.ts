import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware Link, router and pathname helpers. Use these instead of next/link in pages. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
