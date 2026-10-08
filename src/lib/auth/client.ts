"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth calls (sign in, sign up, OAuth redirect, password reset). Same origin. */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, requestPasswordReset, resetPassword } = authClient;
