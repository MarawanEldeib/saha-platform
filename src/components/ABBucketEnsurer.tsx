"use client";

import React from "react";
import { ensureABBucket } from "@/lib/cookies/preferences-client";

// SAH-122 #5: ensures `saha_ab_bucket` exists once consent is granted.
// No experiment is wired yet — this just bakes the sticky-variant
// infrastructure so a future homepage A/B can read getABBucket() on
// the server and branch deterministically. Lightweight: runs once
// per mount, short-circuits if the cookie is already set.

export function ABBucketEnsurer() {
    React.useEffect(() => {
        ensureABBucket();
    }, []);
    return null;
}
