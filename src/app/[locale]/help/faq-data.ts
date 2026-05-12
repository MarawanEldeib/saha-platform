// SAH-153: FAQ entries — the keys here drive the messages.json structure.
// Each entry resolves two translations: `help.faq.<category>.<key>.q` (question)
// and `.a` (answer). Adding a new question means: add a row here, then add
// the q + a strings to en.json AND ar.json.

export const FAQ_CATEGORIES = [
    {
        slug: "booking",
        keys: [
            "how_to_book",
            "without_account",
            "facility_cancels",
            "move_booking",
            "recurring",
        ],
    },
    {
        slug: "payment",
        keys: [
            "methods",
            "when_charged",
            "refund_timing",
            "platform_fee",
            "card_storage",
        ],
    },
    {
        slug: "account",
        keys: [
            "change_phone",
            "delete_account",
            "phone_verification",
            "qr_code",
        ],
    },
    {
        slug: "facilities",
        keys: [
            "how_to_list",
            "stripe_connect",
            "payouts",
            "disable_court",
        ],
    },
    {
        slug: "cancellations",
        keys: [
            "window",
            "no_show",
            "recurring_partial",
            "facility_cancel_refund",
        ],
    },
    {
        slug: "privacy",
        keys: [
            "data_use",
            "cookies",
            "data_export",
        ],
    },
] as const;

export type FAQCategorySlug = typeof FAQ_CATEGORIES[number]["slug"];
