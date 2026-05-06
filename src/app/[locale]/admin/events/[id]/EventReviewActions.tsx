"use client";

import React from "react";
import { approveEventAction, rejectEventAction } from "../../actions";
import { Button } from "@/components/ui/Button";
import { CheckCircle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface EventReviewActionsProps {
    eventId: string;
    locale: string;
}

export function EventReviewActions({ eventId, locale }: EventReviewActionsProps) {
    const router = useRouter();
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleApprove = async () => {
        setLoading(true);
        const result = await approveEventAction(eventId);
        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            router.push(`/${locale}/admin/events`);
        }
    };

    const handleReject = async () => {
        setLoading(true);
        const result = await rejectEventAction(eventId);
        if (result.error) {
            setError(result.error);
            setLoading(false);
        } else {
            router.push(`/${locale}/admin/events`);
        }
    };

    return (
        <div className="space-y-4">
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            <div className="flex gap-3">
                <Button variant="primary" loading={loading} onClick={handleApprove}>
                    <CheckCircle className="h-4 w-4" /> Approve
                </Button>
                <Button variant="danger" loading={loading} onClick={handleReject}>
                    <XCircle className="h-4 w-4" /> Reject
                </Button>
            </div>
        </div>
    );
}
