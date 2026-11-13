---
title: Invoices, payments and receipts
description: Bill a client from a payment term or your own lines, record the payments you receive, and give the client a numbered receipt for each one.
order: 1
updated: 2026-11-12
---

Billing lives in the project, under **Billing**. A project holds a payment schedule, its invoices and the history of payments. Every figure on the page is added up from those records.

## Create an invoice

1. In **Billing**, set the project value and split it into payment terms (a percentage or a fixed amount, with a due date). A term that already has an invoice is locked.
2. Draft an invoice from a term, or write your own lines with a description, a quantity and a price. A draft is visible only to your team.
3. Press **Issue**. The invoice gets a number such as `INV-2026-001` and becomes visible to the client. A number is issued once and never reused, and a draft has none.
4. Press **Mark as sent** when you have sent it yourself. The client also sees it on the portal and gets an email with the invoice attached as a PDF.

You can cancel an invoice that has no payments. Void the payments first if it has any.

## Record a payment

Open an issued invoice in **Billing** and press **Record payment**. Enter the amount, the date, the method and a reference such as a bank transfer number. You cannot record more than the balance. The invoice moves to partly paid or paid by itself.

![The transaction history with each payment and its receipt number](/api/docs/assets/owner/invoices-01-ledger.png)

## The receipt

Recording a payment issues its receipt in the same step, numbered like `KWT-2026-001`. The receipt copies the amount, date, method and reference from the payment and writes the amount in words. The client is notified, gets the receipt as a PDF in the email, and finds it under **Payments** on the portal.

![A receipt with the amount in words, the invoice it pays and the issuer](/api/docs/assets/owner/invoices-02-receipt.png)

Use **Print or save as PDF** or **Download PDF** on the receipt or invoice page.

A payment recorded before receipts existed shows **Issue receipt** in the history. Press it once to create the receipt.

## Correct a mistake

Payments are never deleted. Press **Void** on the payment and give a reason. The row stays in the history with a line through it, the invoice balance is recalculated, and the receipt is voided with it. Its number is not reused. The client no longer sees a voided receipt. Record the payment again if it was entered wrongly.

## Good to know

- The currency of a project cannot change once it has an invoice.
- Only owners and admins can issue, cancel or record payments. Editors and viewers can read.
- The issuer on an invoice and a receipt is your organization. With white label open it is your legal name, tax number and address (see the white label policy).
