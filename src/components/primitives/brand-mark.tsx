import { Logo } from "@/components/primitives/logo";
import { cn } from "@/lib/utils";

/**
 * The mark of whoever the person is dealing with: the agency's logo and name when it has a brand,
 * the Saqina mark otherwise. The logo sits on a light plate so a dark logo reads on the dark
 * portal. The image is served by an authenticated route, so it needs a plain <img>.
 */
export function BrandMark({
  brand,
  className,
}: {
  brand: { name: string | null; logoUrl: string | null } | null;
  className?: string;
}) {
  if (!brand || (!brand.name && !brand.logoUrl)) return <Logo className={className} />;
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      {brand.logoUrl ? (
        // biome-ignore lint/performance/noImgElement: private route, not optimisable by next/image
        <img
          src={brand.logoUrl}
          alt={brand.name ?? ""}
          className="h-8 w-auto max-w-32 rounded-sm bg-white object-contain p-0.5"
        />
      ) : null}
      {brand.name ? <span className="truncate">{brand.name}</span> : null}
    </span>
  );
}
