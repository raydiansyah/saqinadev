---
title: Payment and signature reminders
description: Set when Saqina reminds you and your client about unpaid invoices, agreements waiting for a signature and maintenance renewals.
order: 3
updated: 2026-11-12
---

Reminders run once a day and need nothing from you after the rules are set. Open **Reminders** in the dashboard.

![The reminder rules grouped by kind, each with an on and off switch](/api/docs/assets/owner/reminders-01-rules.png)

## Rules

Each rule says how many days before or after a date it fires and who gets it.

- Invoice due: before the due date, for example 7 and 3 days before and on the day.
- Invoice overdue: after the due date, for example 1 and 7 days after.
- Agreement waiting for a signature: after the team approved a shared agreement and the client has not signed, for example 3 and 7 days after.
- Maintenance renewal: before a maintenance plan ends.

Each rule goes to the team, the client or both. A client only receives reminders while the portal is open for the project. Switch a rule off to stop it. If the job was down for a week, it sends the latest rule that applies, not one message per missed day. The same reminder is never sent twice for the same item.

## Where reminders arrive

Every reminder appears in notifications. It also goes out by email when an email provider is set up. A rule that goes to the client can also send a WhatsApp message to the client's phone number: switch on **WhatsApp** next to it. The number comes from the client's record and is read in the forms `0812...`, `+62 812...` and `62812...`. A client without a usable number is skipped, and the skip is recorded.

WhatsApp has no provider connected yet, so for now a rule that asks for it is recorded as skipped in production.

## Run now

Press **Run now** to run the same job for your organization straight away. It says how many reminders were sent and how many had already gone out.
