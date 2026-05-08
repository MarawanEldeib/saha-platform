import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2026-04-22.dahlia",
        });
    }
    return _stripe;
}

export const PLATFORM_FEE_PERCENT = 10;
