import type { JsonRecord } from "./runtime.ts";

export function projectRows(url: URL, rows: JsonRecord[]): JsonRecord[] {
    const fields = selectedFields(url);
    if (!fields.length || fields.includes("*")) {
        return rows;
    }
    return rows.map((row) => projectRecord(row, fields));
}

export function projectRecord(row: JsonRecord, fields: string[]): JsonRecord {
    return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

export function selectedFields(url: URL): string[] {
    return splitSelectFields(url.searchParams.get("select") ?? "");
}

export function splitSelectFields(select: string): string[] {
    const fields: string[] = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < select.length; index += 1) {
        if (select[index] === "(") {
            depth += 1;
        } else if (select[index] === ")") {
            depth -= 1;
        } else if (select[index] === "," && depth === 0) {
            fields.push(select.slice(start, index).trim());
            start = index + 1;
        }
    }
    fields.push(select.slice(start).trim());
    return fields.filter(Boolean);
}

export function embeddedFields(fields: string[], prefix: string): string[] {
    const field = fields.find((candidate) => candidate.startsWith(`${prefix}!`) || candidate.startsWith(`${prefix}(`));
    if (!field) {
        return [];
    }
    const open = field.indexOf("(");
    return open < 0 ? [] : splitSelectFields(field.slice(open + 1, -1));
}

export function stableJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function shipmentReservationError(
    request: JsonRecord,
    deliveryQuotes: JsonRecord[],
    relaySelections: JsonRecord[],
): string | null {
    const reservation = request.p_reservation as JsonRecord;
    const check = request.p_quote_check as JsonRecord;
    const externalOrderId = String(check.externalOrderId ?? "");
    const quoteId = String(reservation.delivery_quote_id ?? "");
    const quotePurpose = String(request.p_quote_purpose ?? "");
    const quoteExternalOrderId = String(request.p_quote_external_order_id ?? "");
    const selectedFor = String(request.p_selected_for_cms_user_id ?? "");
    const quote = deliveryQuotes.find((row) => row.quote_id === quoteId);
    if (!externalOrderId.startsWith("claim-return:") && !quote) {
        return "an exact immutable delivery quote is required before shipment creation";
    }
    if (
        quoteId &&
        (!quote || quote.external_order_id !== quoteExternalOrderId || quote.selected_for_cms_user_id !== selectedFor)
    ) {
        return "shipment delivery quote binding is invalid";
    }
    if (quote) {
        const mainFulfillment = quotePurpose === "fulfillment";
        if (mainFulfillment && quoteExternalOrderId !== externalOrderId) {
            return "main shipment delivery quote belongs to another order";
        }
        if (
            mainFulfillment &&
            (quote.relay_location !== check.deliveryRelayLocation ||
                quote.weight_grams !== check.weightGrams ||
                quote.merchandise_subtotal_minor_amount !== check.declaredValueMinorAmount ||
                String(quote.currency).toUpperCase() !== check.declaredCurrency)
        ) {
            return "shipment financial or relay input does not match the immutable quote";
        }
        const expectedSender =
            quotePurpose === "claim_return" ? quote.recipient_snapshot : quote.seller_fulfillment_snapshot;
        const expectedRecipient =
            quotePurpose === "claim_return" ? quote.seller_fulfillment_snapshot : quote.recipient_snapshot;
        if (!sameTestAddress(check.sender, expectedSender) || !sameTestAddress(check.recipient, expectedRecipient)) {
            return "shipment address input does not match the immutable quote snapshot";
        }
    } else {
        const selection = relaySelections.find((row) => row.external_order_id === externalOrderId);
        if (selection && String(selection.relay_location) !== check.deliveryRelayLocation) {
            return "shipment relay does not match the immutable server selection";
        }
    }
    return null;
}

export function sameTestAddress(actual: unknown, expected: unknown): boolean {
    if (
        !actual ||
        typeof actual !== "object" ||
        Array.isArray(actual) ||
        !expected ||
        typeof expected !== "object" ||
        Array.isArray(expected)
    ) {
        return false;
    }
    const left = actual as JsonRecord;
    const right = expected as JsonRecord;
    return [
        "name",
        "firstName",
        "lastName",
        "phone",
        "addressLine1",
        "addressLine2",
        "addressLine3",
        "postalCode",
        "city",
        "country",
        "email",
    ].every((field) => String(left[field] ?? "").trim() === String(right[field] ?? "").trim());
}

export function nullableTimestampDescending(left: unknown, right: unknown): number {
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing) {
        return rightMissing ? 0 : 1;
    }
    if (rightMissing) {
        return -1;
    }
    return timestamp(right) - timestamp(left);
}

export function timestamp(value: unknown): number {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
}
