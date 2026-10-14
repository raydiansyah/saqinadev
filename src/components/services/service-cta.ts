import type { CtaType } from "@/lib/domain/services";
import type { PublicService } from "@/lib/services/public";

/** A Coming Soon service can only take a waiting list entry, whatever CTA the Owner picked. */
export function effectiveCtaType(
  service: Pick<PublicService, "ctaType" | "isComingSoon">,
): CtaType {
  return service.isComingSoon ? "waitlist" : service.ctaType;
}

/** Start-a-project goes to the app; everything else points at the inquiry form on the page. */
export const ctaHref = (type: CtaType) =>
  type === "start_project" ? "/dashboard/new" : "#inquiry";

/** The Owner's label wins when set, but only while the CTA is the one they wrote it for. */
export function ctaLabelOverride(
  service: Pick<PublicService, "ctaType" | "ctaLabel" | "isComingSoon">,
) {
  return service.isComingSoon && service.ctaType !== "waitlist" ? "" : service.ctaLabel;
}
