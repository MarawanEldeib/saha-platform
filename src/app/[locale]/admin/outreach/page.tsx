"use client";

import React from "react";
import { sendEmailCampaignAction } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle, Mail } from "lucide-react";

export default function AdminOutreachPage() {
    const [subject, setSubject] = React.useState("");
    const [body, setBody] = React.useState(`<p>Dear Facility Owner,</p>
<p>We would like to invite you to list your sports facility on <strong>Saha</strong>, the student-focused sports directory for Stuttgart and Baden-Württemberg.</p>
<p>Listing is free. Connect with student athletes at your facility today.</p>
<p>Visit <a href="https://saha.app">saha.app</a> to get started.</p>`);
    const [emails, setEmails] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<{ sent: number; failed: number } | null>(null);

    const handleSend = async () => {
        if (!subject || !body || !emails) {
            setError("Please fill in all fields.");
            return;
        }
        setLoading(true);
        setError(null);
        const fd = new FormData();
        fd.append("subject", subject);
        fd.append("body", body);
        fd.append("emails", emails);
        const res = await sendEmailCampaignAction(fd);
        setLoading(false);
        if (res.error) { setError(res.error); return; }
        if ("sent" in res) setResult({ sent: res.sent!, failed: res.failed! });
    };

    if (result) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-12 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Campaign Sent</h1>
                <p className="text-gray-600 dark:text-gray-400">
                    <strong className="text-emerald-600">{result.sent}</strong> emails sent.{" "}
                    {result.failed > 0 && <span className="text-red-500">{result.failed} failed.</span>}
                </p>
                <Button variant="outline" className="mt-6" onClick={() => { setResult(null); setSubject(""); setEmails(""); }}>
                    Send Another
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div className="flex items-center gap-3">
                <Mail className="h-6 w-6 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Outreach Campaign</h1>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <Input
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Invite your sports facility to Saha"
                />

                <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Body (HTML)</label>
                    <textarea
                        rows={8}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Recipient Email List</label>
                    <textarea
                        rows={4}
                        value={emails}
                        onChange={(e) => setEmails(e.target.value)}
                        placeholder="Paste comma-separated or newline-separated email addresses here"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {emails.split(/[\n,]+/).filter((e) => e.trim().includes("@")).length} valid addresses detected
                    </p>
                </div>

                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

                <Button variant="primary" loading={loading} onClick={handleSend} className="w-full">
                    <Mail className="h-4 w-4" /> Send Campaign
                </Button>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                Emails are sent via Resend in batches of 50. Unsubscribe instructions are included automatically.
            </p>
        </div>
    );
}
