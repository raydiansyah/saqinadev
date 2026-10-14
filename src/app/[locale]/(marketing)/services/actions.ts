"use server";

import { headers } from "next/headers";
import { runAction } from "@/lib/actions";
import { submitInquiry } from "@/lib/services/inquiries";

/** The client address as seen by the platform proxy; never taken from the request body. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
}

/** Public inquiry. Validation, rate limiting and the honeypot live in the service. */
export async function submitInquiryAction(input: unknown) {
  const ip = await clientIp();
  return runAction("service_inquiry.submit", {}, () => submitInquiry(input, { ip }));
}
