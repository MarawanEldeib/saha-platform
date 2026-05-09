"use client";

import { Printer } from "lucide-react";

export function PrintInvoiceButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
        >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
        </button>
    );
}
