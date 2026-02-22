"use client";

import React from "react";
import { approveFacilityAction, rejectFacilityAction } from "../../actions";
import { Button } from "@/components/ui/Button";
import { CheckCircle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/Input";

interface ReviewActionsProps {
    facilityId: string;
    locale: string;
}

export function FacilityReviewActions({ facilityId, locale }: ReviewActionsProps) {
    const router = useRouter();
    const [rejecting, setRejecting] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleApprove = async () => {
        setLoading(true);
        const result = await approveFacilityAction(facilityId);
        if (result.error) { setError(result.error); setLoading(false); }
        else router.push(`/${locale}/admin`);
    };

    const handleReject = async () => {
        if (!reason.trim()) { setError("Please provide a reason."); return; }
        setLoading(true);
        const result = await rejectFacilityAction(facilityId, reason);
        if (result.error) { setError(result.error); setLoading(false); }
        else router.push(`/${locale}/admin`);
    };

    return (
        <div className="space-y-4">
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {rejecting ? (
                <div className="space-y-3">
                    <Textarea
                        label="Rejection reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain why the facility is being rejected..."
                    />
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
                        <Button variant="danger" loading={loading} onClick={handleReject}>
                            <XCircle className="h-4 w-4" /> Confirm Reject
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-3">
                    <Button variant="primary" loading={loading} onClick={handleApprove}>
                        <CheckCircle className="h-4 w-4" /> Approve
                    </Button>
                    <Button variant="danger" onClick={() => setRejecting(true)}>
                        <XCircle className="h-4 w-4" /> Reject
                    </Button>
                </div>
            )}
        </div>
    );
}
