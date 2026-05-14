// SAH-154: outbound-email configuration. The from-address + support
// email used to be hardcoded in three different files; centralizing
// here means a single edit (or env var) renames everything at once.
//
// Saha does NOT own a domain yet. Defaults use Resend's free test sender
// (`onboarding@resend.dev`) which only delivers to the Resend account
// owner's inbox — fine for staging / smoke tests. Override via env when
// a real domain is verified in Resend.
//
// `process.env.SAHA_EMAIL_FROM` overrides the from-address.
// `process.env.SAHA_SUPPORT_EMAIL` overrides the support-email default.

import { BRAND_NAME } from "./constants";

/** Address used as the From: header on transactional emails. */
export const FROM_ADDRESS = process.env.SAHA_EMAIL_FROM ?? `${BRAND_NAME} <onboarding@resend.dev>`;

/** Mailto target surfaced to users for support / contact. */
export const SUPPORT_EMAIL = process.env.SAHA_SUPPORT_EMAIL ?? "onboarding@resend.dev";
