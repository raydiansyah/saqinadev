"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { convertInquiryToClient, updateInquiryStatus } from "@/lib/services/inquiries";
import { parse } from "@/lib/validation";

const idSchema = z.uuid();

function refresh() {
  revalidatePath("/[locale]/dashboard/services", "layout");
}

export const setInquiryStatusAction = async (id: string, status: string) =>
  runAction("services.inquiry.status", {}, async () => {
    await updateInquiryStatus(await requireActor(), parse(idSchema, id), { status });
    refresh();
  });

export const makeClientAction = async (id: string) =>
  runAction("services.inquiry.convert", {}, async () => {
    const client = await convertInquiryToClient(await requireActor(), parse(idSchema, id));
    refresh();
    // Clients are listed under the dashboard too.
    revalidatePath("/[locale]/dashboard/clients", "layout");
    return { id: client.id };
  });
