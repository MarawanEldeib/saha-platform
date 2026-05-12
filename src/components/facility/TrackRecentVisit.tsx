"use client";

import React from "react";
import { addRecentFacility } from "@/lib/cookies/preferences-client";

// SAH-122: tiny client child that pushes the current facility id into
// the recently-viewed cookie on mount. Server component can't write
// cookies directly, so this mounts inside the facility detail page and
// fires once per visit.

export function TrackRecentVisit({ facilityId }: { facilityId: string }) {
    React.useEffect(() => {
        addRecentFacility(facilityId);
    }, [facilityId]);
    return null;
}
