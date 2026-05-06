export const LAUNCH_COUNTRIES = [
    "Egypt",
    "Malaysia",
    "Qatar",
    "United Arab Emirates",
] as const;

export const FOCUS_SPORTS = [
    "Padel",
    "Badminton",
    "Squash",
    "Tennis",
] as const;

export type LaunchCountry = (typeof LAUNCH_COUNTRIES)[number];
