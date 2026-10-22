/** What a team confirms before a project is called delivered, in the order it happens. */
export const DELIVERY_STEPS = ["build", "review", "deploy"] as const;
export type DeliveryStep = (typeof DELIVERY_STEPS)[number];
