/**
 * SAH-90: UAE VAT-compliant tax invoice as react-pdf. Mirrors the
 * HTML invoice at /[locale]/bookings/[id]/invoice but renders to a
 * Buffer so it can be attached to the Resend booking-confirmation
 * email.
 *
 * Title flips between "Tax Invoice" and "Invoice" based on whether
 * the facility has a TRN set. VAT 5% line shows when TRN is set;
 * otherwise the disclosure "VAT not applicable" is printed.
 *
 * Player TRN, when set on the player's profile, is printed under
 * the player's name in the "Issued to" block.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";

export interface InvoicePdfData {
    invoiceNumber: string;
    issuedAt: string;          // ISO date string
    bookingId: string;
    facility: {
        name: string;
        address: string;
        city: string;
        country: string;
        phone: string | null;
        trn: string | null;
    };
    player: {
        displayName: string;
        trn: string | null;
    };
    line: {
        courtName: string;
        facilityName: string;
        date: string;          // formatted "EEEE, MMMM d, yyyy"
        timeRange: string;     // formatted "HH:MM–HH:MM"
        numPlayers: number;
    };
    subtotal: number;
    vat: number;               // 0 when facility has no TRN
    total: number;
    currency: string;
    hasTrn: boolean;
}

const styles = StyleSheet.create({
    page: {
        paddingTop: 50,
        paddingBottom: 56,
        paddingHorizontal: 50,
        fontSize: 10,
        fontFamily: "Helvetica",
        color: "#111827",
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
        paddingBottom: 16,
        marginBottom: 24,
    },
    title: { fontSize: 20, fontWeight: 700 },
    titleMeta: { fontSize: 9, color: "#6b7280", marginTop: 4 },
    brandName: { fontSize: 14, fontWeight: 700, color: "#059669" },
    partiesRow: {
        flexDirection: "row",
        gap: 24,
        marginBottom: 28,
    },
    party: { flex: 1 },
    partyLabel: {
        fontSize: 8,
        textTransform: "uppercase",
        color: "#6b7280",
        marginBottom: 4,
    },
    partyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
    partyLine: { fontSize: 9, color: "#374151", lineHeight: 1.4 },
    partyTrn: { fontSize: 9, fontWeight: 700, marginTop: 4 },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#f3f4f6",
        paddingVertical: 6,
        paddingHorizontal: 8,
        fontSize: 8,
        textTransform: "uppercase",
        color: "#6b7280",
        fontWeight: 700,
        borderRadius: 4,
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    cellDesc: { width: "75%" },
    cellAmount: { width: "25%", textAlign: "right" },
    lineTitle: { fontSize: 10, fontWeight: 700 },
    lineMeta: { fontSize: 8, color: "#6b7280", marginTop: 2 },
    totalsBox: {
        marginTop: 14,
        marginLeft: "auto",
        width: "55%",
        borderTopWidth: 2,
        borderTopColor: "#111827",
        paddingTop: 8,
    },
    totalsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 4,
        fontSize: 10,
    },
    totalsLabel: { color: "#374151" },
    totalsValue: { color: "#111827" },
    vatNote: {
        fontSize: 8,
        color: "#6b7280",
        fontStyle: "italic",
        marginTop: 2,
    },
    grandTotalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        fontSize: 12,
        fontWeight: 700,
    },
    footer: {
        position: "absolute",
        bottom: 30,
        left: 50,
        right: 50,
        fontSize: 8,
        color: "#9ca3af",
        borderTopWidth: 0.5,
        borderTopColor: "#e5e7eb",
        paddingTop: 6,
        lineHeight: 1.5,
    },
});

function fmt(amount: number, currency: string): string {
    return `${currency} ${amount.toFixed(2)}`;
}

export function InvoiceDocument(props: InvoicePdfData): React.ReactElement {
    const { invoiceNumber, issuedAt, bookingId, facility, player, line, subtotal, vat, total, currency, hasTrn } = props;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.title}>{hasTrn ? "Tax Invoice" : "Invoice"}</Text>
                        <Text style={styles.titleMeta}>
                            {invoiceNumber} · Issued {issuedAt}
                        </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.brandName}>Saha</Text>
                        <Text style={{ fontSize: 9, color: "#6b7280" }}>saha.ae</Text>
                    </View>
                </View>

                <View style={styles.partiesRow}>
                    <View style={styles.party}>
                        <Text style={styles.partyLabel}>Issued by</Text>
                        <Text style={styles.partyName}>{facility.name}</Text>
                        <Text style={styles.partyLine}>{facility.address}</Text>
                        <Text style={styles.partyLine}>
                            {facility.city}{facility.country ? `, ${facility.country}` : ""}
                        </Text>
                        {facility.phone ? <Text style={styles.partyLine}>{facility.phone}</Text> : null}
                        {facility.trn ? <Text style={styles.partyTrn}>TRN: {facility.trn}</Text> : null}
                    </View>
                    <View style={styles.party}>
                        <Text style={styles.partyLabel}>Issued to</Text>
                        <Text style={styles.partyName}>{player.displayName}</Text>
                        <Text style={[styles.partyLine, { color: "#6b7280" }]}>
                            Booking ID: {bookingId.slice(0, 8)}
                        </Text>
                        {player.trn ? <Text style={styles.partyTrn}>TRN: {player.trn}</Text> : null}
                    </View>
                </View>

                <View style={styles.tableHeader}>
                    <Text style={styles.cellDesc}>Description</Text>
                    <Text style={styles.cellAmount}>Amount</Text>
                </View>
                <View style={styles.tableRow} wrap={false}>
                    <View style={styles.cellDesc}>
                        <Text style={styles.lineTitle}>{line.courtName} — {line.facilityName}</Text>
                        <Text style={styles.lineMeta}>
                            {line.date} · {line.timeRange} · {line.numPlayers} {line.numPlayers === 1 ? "player" : "players"}
                        </Text>
                    </View>
                    <Text style={[styles.cellAmount, { fontSize: 10 }]}>{fmt(subtotal, currency)}</Text>
                </View>

                <View style={styles.totalsBox}>
                    <View style={styles.totalsRow}>
                        <Text style={styles.totalsLabel}>Subtotal</Text>
                        <Text style={styles.totalsValue}>{fmt(subtotal, currency)}</Text>
                    </View>
                    {hasTrn ? (
                        <View style={styles.totalsRow}>
                            <Text style={styles.totalsLabel}>VAT (5%)</Text>
                            <Text style={styles.totalsValue}>{fmt(vat, currency)}</Text>
                        </View>
                    ) : (
                        <Text style={styles.vatNote}>
                            VAT not applicable — facility under VAT registration threshold.
                        </Text>
                    )}
                    <View style={styles.grandTotalRow}>
                        <Text>Total</Text>
                        <Text>{fmt(total, currency)}</Text>
                    </View>
                </View>

                <View style={styles.footer} fixed>
                    <Text>
                        Payment processed via Stripe. Saha takes a 10% platform fee; remainder is settled to the facility&apos;s connected account.
                    </Text>
                    <Text style={{ marginTop: 2 }}>
                        For invoice queries, contact the facility{facility.phone ? ` at ${facility.phone}` : ""}.
                    </Text>
                </View>
            </Page>
        </Document>
    );
}
