"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { facilityUpdateSchema, type FacilityUpdateInput } from "@/lib/validations";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";
import { adminUpdateFacilityAction } from "../../../actions";

interface Props {
    facility: {
        id: string;
        name: string;
        description: string;
        address: string;
        city: string;
        postal_code: string;
        phone: string;
        website: string;
        trn: string;
    };
    locale: string;
}

/**
 * SAH-132: Admin emergency-edit form. Pure client form on top of
 * `adminUpdateFacilityAction`. The action snapshots previous values and the
 * reason field into the audit log — so the reason input is required.
 */
export function AdminFacilityEditForm({ facility, locale }: Props) {
    const router = useRouter();
    const [reason, setReason] = React.useState("");
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FacilityUpdateInput>({
        resolver: zodResolver(facilityUpdateSchema),
        defaultValues: {
            name: facility.name,
            description: facility.description,
            address: facility.address,
            city: facility.city,
            postal_code: facility.postal_code,
            phone: facility.phone,
            website: facility.website,
            trn: facility.trn,
        },
    });

    const onSubmit = async (data: FacilityUpdateInput) => {
        setServerError(null);
        setSaved(false);
        if (!reason.trim()) {
            setServerError("Please provide a reason for the admin edit.");
            return;
        }
        setSubmitting(true);
        try {
            const result = await adminUpdateFacilityAction(
                facility.id,
                {
                    name: data.name,
                    description: data.description ?? "",
                    address: data.address,
                    city: data.city,
                    postal_code: data.postal_code ?? "",
                    phone: data.phone ?? "",
                    website: data.website ?? "",
                    trn: data.trn ?? "",
                },
                reason.trim(),
            );
            if (result?.error) {
                setServerError(result.error);
                return;
            }
            setSaved(true);
            router.refresh();
            // Bounce back to the detail page after a short pause so the admin
            // can see the success state, then verify the change in context.
            setTimeout(() => {
                router.push(`/${locale}/admin/facilities/${facility.id}`);
            }, 800);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Facility name" error={errors.name?.message} {...register("name")} />
                    <Input label="City" error={errors.city?.message} {...register("city")} />
                </div>
                <Input label="Address" error={errors.address?.message} {...register("address")} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input label="Postal code" error={errors.postal_code?.message} {...register("postal_code")} />
                    <Input label="Phone" error={errors.phone?.message} {...register("phone")} />
                    <Input label="Website" placeholder="https://" error={errors.website?.message} {...register("website")} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                    </label>
                    <textarea
                        {...register("description")}
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
                </div>
                <Input label="VAT TRN" inputMode="numeric" maxLength={15} error={errors.trn?.message} {...register("trn")} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-2">
                <label htmlFor="admin_edit_reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason for admin edit (required) <span className="text-red-500">*</span>
                </label>
                <input
                    id="admin_edit_reason"
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Owner unreachable for 5 days, broken phone number flagged by player"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Stored verbatim in the audit log alongside previous + next values.
                </p>
            </div>

            <div className="sticky bottom-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                    {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                    {saved && !serverError && (
                        <p className="text-sm text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> Saved.
                        </p>
                    )}
                </div>
                <Button type="submit" variant="primary" loading={submitting}>
                    Save admin edit
                </Button>
            </div>
        </form>
    );
}
