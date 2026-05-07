import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
});

export const PLATFORM_FEE_PERCENT = 10; // 10% platform commission
