import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    error?: string;
    label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, label, id, ...props }, ref) => {
        const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={cn(
                        "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900",
                        "placeholder:text-gray-400",
                        "transition-colors duration-150",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                        "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60",
                        "dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-500",
                        error
                            ? "border-red-400 focus:ring-red-400"
                            : "border-gray-300 dark:border-gray-600",
                        className
                    )}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    {...props}
                />
                {error && (
                    <p id={`${inputId}-error`} className="text-xs text-red-500">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: string;
    label?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, label, id, ...props }, ref) => {
        const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        {label}
                    </label>
                )}
                <textarea
                    ref={ref}
                    id={inputId}
                    rows={4}
                    className={cn(
                        "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900",
                        "placeholder:text-gray-400 resize-none",
                        "transition-colors duration-150",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                        "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60",
                        "dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600",
                        error ? "border-red-400 focus:ring-red-400" : "border-gray-300",
                        className
                    )}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    {...props}
                />
                {error && (
                    <p id={`${inputId}-error`} className="text-xs text-red-500">
                        {error}
                    </p>
                )}
            </div>
        );
    }
);
Textarea.displayName = "Textarea";
