import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The saqina.dev mark and wordmark. The mark's lower half is drawn light (logo-mark-light)
 * so it reads on the dark surfaces; the original artwork lives in /public/brand.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Image
        src="/brand/logo-mark-light.png"
        alt=""
        width={24}
        height={24}
        priority
        className="size-6"
      />
      <span>
        saqina<span className="text-primary">dev</span>
      </span>
    </span>
  );
}
