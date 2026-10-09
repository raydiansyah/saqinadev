import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { ensurePersonalOrg } from "@/lib/organizations/service";
import { authEmails, getEmailSender } from "./email";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
    : undefined;

/** True when Google OAuth credentials are configured; the UI hides the button otherwise. */
export const isGoogleEnabled = () => google !== undefined;

/**
 * The only place that configures Better Auth. Application code goes through
 * `lib/auth/server.ts` (sessions, guards) and `lib/auth/client.ts` (browser calls).
 */
export const auth = betterAuth({
  appName: "Saqina Dev",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    async sendResetPassword({ user, url }) {
      await getEmailSender().send({ to: user.email, ...authEmails.reset(user.name, url) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await getEmailSender().send({ to: user.email, ...authEmails.verify(user.name, url) });
    },
  },
  socialProviders: google ? { google } : {},
  databaseHooks: {
    user: {
      create: {
        // Every account owns a personal organization from the start.
        async after(user) {
          await ensurePersonalOrg(user.id);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    // Credential endpoints get a much tighter budget than session reads.
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      "/send-verification-email": { window: 300, max: 5 },
    },
  },
  telemetry: { enabled: false },
  // nextCookies must stay last: it writes Set-Cookie headers from server actions.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
