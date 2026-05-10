/**
 * SAH-126 Stage B: PDF report document for facility owners.
 *
 * Pure react-pdf — no DOM, no Tailwind. Each "view" is a Page primitive
 * from @react-pdf/renderer. The route handler in
 * `src/app/api/bookings/report/route.ts` renders this to a PDF buffer
 * and streams it back as `application/pdf`.
 *
 * Layout follows a finance-report convention: header with facility +
 * period, KPI strip, per-court breakdown, then the detailed list with
 * page breaks every ~25 rows. Footer has a generated-at timestamp + page
 * numbers via react-pdf's render prop.
 */

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import React from "react";

export interface BookingRow {
    date: string;
    start_time: string;
    end_time: string;
    court_name: string;
    player_name: string;
    status: string;
    amount: number;
}

export interface CourtBreakdown {
    court_id: string;
    court_name: string;
    bookings: number;
    revenue: number;
}

export interface BookingReportData {
    facilityName: string;
    facilityCity: string;
    facilityCountry: string;
    currency: string;
    periodFrom: string;
    periodTo: string;
    generatedAt: string;
    summary: {
        totalBookings: number;
        totalRevenue: number;
        confirmed: number;
        completed: number;
        pending: number;
        cancelled: number;
        noShow: number;
        averageBookingValue: number;
        noShowRate: number;
    };
    perCourt: CourtBreakdown[];
    rows: BookingRow[];
    logoUrl?: string;
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingBottom: 56,
        paddingHorizontal: 40,
        fontSize: 10,
        fontFamily: "Helvetica",
        color: "#111827",
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 20,
    },
    brand: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    logo: { width: 28, height: 28 },
    brandName: {
        fontSize: 18,
        fontWeight: 700,
        color: "#059669",
    },
    headerMeta: {
        textAlign: "right",
    },
    titleBlock: {
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    title: {
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 4,
    },
    facilityLine: {
        fontSize: 10,
        color: "#6b7280",
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 700,
        marginTop: 18,
        marginBottom: 8,
    },
    kpiRow: {
        flexDirection: "row",
        gap: 8,
    },
    kpi: {
        flex: 1,
        padding: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 6,
    },
    kpiLabel: {
        fontSize: 8,
        color: "#6b7280",
        textTransform: "uppercase",
        marginBottom: 4,
    },
    kpiValue: {
        fontSize: 14,
        fontWeight: 700,
    },
    table: {
        marginTop: 6,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#f3f4f6",
        paddingVertical: 6,
        paddingHorizontal: 6,
        fontSize: 9,
        fontWeight: 700,
        color: "#374151",
        borderRadius: 4,
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 5,
        paddingHorizontal: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: "#e5e7eb",
        fontSize: 9,
    },
    cell_date: { width: "16%" },
    cell_time: { width: "14%" },
    cell_court: { width: "20%" },
    cell_player: { width: "26%" },
    cell_status: { width: "12%" },
    cell_amount: { width: "12%", textAlign: "right" },
    statusPill: {
        paddingVertical: 2,
        paddingHorizontal: 5,
        borderRadius: 8,
        fontSize: 8,
        fontWeight: 700,
        textAlign: "center",
        color: "#374151",
    },
    footer: {
        position: "absolute",
        left: 40,
        right: 40,
        bottom: 24,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 8,
        color: "#9ca3af",
        borderTopWidth: 0.5,
        borderTopColor: "#e5e7eb",
        paddingTop: 6,
    },
});

const STATUS_BG: Record<string, string> = {
    confirmed: "#d1fae5",
    completed: "#dbeafe",
    pending: "#fef3c7",
    cancelled: "#fee2e2",
    no_show: "#f3f4f6",
};

function fmt(amount: number, currency: string): string {
    // react-pdf doesn't run Intl.NumberFormat reliably across all engines;
    // hand-format and prefix with the currency code.
    return `${currency} ${amount.toFixed(2)}`;
}

export function BookingReportDocument(props: BookingReportData): React.ReactElement {
    const { facilityName, facilityCity, facilityCountry, currency, periodFrom, periodTo, generatedAt, summary, perCourt, rows, logoUrl } = props;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.headerRow}>
                    <View style={styles.brand}>
                        {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
                        <Text style={styles.brandName}>Saha</Text>
                    </View>
                    <View style={styles.headerMeta}>
                        <Text>Generated {generatedAt}</Text>
                        <Text style={{ color: "#6b7280" }}>sahasports.vercel.app</Text>
                    </View>
                </View>

                <View style={styles.titleBlock}>
                    <Text style={styles.title}>Booking report</Text>
                    <Text style={styles.facilityLine}>
                        {facilityName} · {facilityCity}, {facilityCountry} · Period {periodFrom} → {periodTo}
                    </Text>
                </View>

                {/* KPIs */}
                <Text style={styles.sectionTitle}>Summary</Text>
                <View style={styles.kpiRow}>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Total bookings</Text>
                        <Text style={styles.kpiValue}>{summary.totalBookings}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Total revenue</Text>
                        <Text style={styles.kpiValue}>{fmt(summary.totalRevenue, currency)}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Avg booking</Text>
                        <Text style={styles.kpiValue}>{fmt(summary.averageBookingValue, currency)}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>No-show rate</Text>
                        <Text style={styles.kpiValue}>{(summary.noShowRate * 100).toFixed(1)}%</Text>
                    </View>
                </View>

                <View style={[styles.kpiRow, { marginTop: 8 }]}>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Confirmed</Text>
                        <Text style={styles.kpiValue}>{summary.confirmed}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Completed</Text>
                        <Text style={styles.kpiValue}>{summary.completed}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Pending</Text>
                        <Text style={styles.kpiValue}>{summary.pending}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>Cancelled</Text>
                        <Text style={styles.kpiValue}>{summary.cancelled}</Text>
                    </View>
                    <View style={styles.kpi}>
                        <Text style={styles.kpiLabel}>No-show</Text>
                        <Text style={styles.kpiValue}>{summary.noShow}</Text>
                    </View>
                </View>

                {/* Per-court breakdown */}
                {perCourt.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>By court</Text>
                        <View style={styles.table}>
                            <View style={styles.tableHeader}>
                                <Text style={{ width: "55%" }}>Court</Text>
                                <Text style={{ width: "20%", textAlign: "right" }}>Bookings</Text>
                                <Text style={{ width: "25%", textAlign: "right" }}>Revenue</Text>
                            </View>
                            {perCourt.map((c) => (
                                <View key={c.court_id} style={styles.tableRow} wrap={false}>
                                    <Text style={{ width: "55%" }}>{c.court_name}</Text>
                                    <Text style={{ width: "20%", textAlign: "right" }}>{c.bookings}</Text>
                                    <Text style={{ width: "25%", textAlign: "right" }}>{fmt(c.revenue, currency)}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* Detailed list */}
                <Text style={styles.sectionTitle} break>Bookings detail</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeader} fixed>
                        <Text style={styles.cell_date}>Date</Text>
                        <Text style={styles.cell_time}>Time</Text>
                        <Text style={styles.cell_court}>Court</Text>
                        <Text style={styles.cell_player}>Player</Text>
                        <Text style={styles.cell_status}>Status</Text>
                        <Text style={styles.cell_amount}>Amount</Text>
                    </View>
                    {rows.length === 0 ? (
                        <View style={styles.tableRow}>
                            <Text style={{ flex: 1, textAlign: "center", color: "#9ca3af" }}>No bookings in this period.</Text>
                        </View>
                    ) : (
                        rows.map((r, i) => (
                            <View key={i} style={styles.tableRow} wrap={false}>
                                <Text style={styles.cell_date}>{r.date}</Text>
                                <Text style={styles.cell_time}>{r.start_time}–{r.end_time}</Text>
                                <Text style={styles.cell_court}>{r.court_name}</Text>
                                <Text style={styles.cell_player}>{r.player_name}</Text>
                                <Text style={[styles.cell_status]}>
                                    <Text style={[styles.statusPill, { backgroundColor: STATUS_BG[r.status] ?? "#f3f4f6" }]}>{r.status}</Text>
                                </Text>
                                <Text style={styles.cell_amount}>{fmt(r.amount, currency)}</Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.footer} fixed>
                    <Text>Saha · Booking report · {periodFrom} → {periodTo}</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
