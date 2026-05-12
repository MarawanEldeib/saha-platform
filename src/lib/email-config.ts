// SAH-154: outbound-email configuration. The from-address + support
// email used to be hardcoded in three different files; centralizing
// here means a single edit (or env var) renames everything at once.
//
// `process.env.SAHA_EMAIL_FROM` overrides the default for staging /
// preview environments where we don't want emails branded as the
// production sender.

import { BRAND_NAME } from "./constants";

/** Address used as the From: header on transactional emails. */
export const FROM_ADDRESS = process.env.SAHA_EMAIL_FROM ?? `${BRAND_NAME} <noreply@saha.ae>`;

/** Mailto target surfaced to users for support / contact. */
export const SUPPORT_EMAIL = process.env.SAHA_SUPPORT_EMAIL ?? "hello@saha.ae";
