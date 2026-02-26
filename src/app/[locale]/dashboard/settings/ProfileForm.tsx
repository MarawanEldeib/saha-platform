"use client";

import React from "react";
import { updateProfileAction } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle } from "lucide-react";

export function ProfileForm({ initialName }: { initialName: string }) {
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setLoading(true);
        const fd = new FormData(e.currentTarget);
        const result = await updateProfileAction(fd);
        setLoading(false);
        if (result?.error) { setError(result.error); return; }
        setSuccess(true);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
            <Input
                label="Display Name"
                name="display_name"
                defaultValue={initialName}
                required
            />
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {success && (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Profile updated successfully!
                </p>
            )}
            <Button type="submit" variant="primary" loading={loading}>Save Changes</Button>
        </form>
    );
}
