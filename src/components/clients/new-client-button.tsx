"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { ClientForm } from "./client-form";

export function NewClientButton() {
  const t = useTranslations("clients");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("newClient")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("newClient")}>
        {open ? (
          <ClientForm
            onCreated={(id) => {
              setOpen(false);
              router.push(`/dashboard/clients/${id}`);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
