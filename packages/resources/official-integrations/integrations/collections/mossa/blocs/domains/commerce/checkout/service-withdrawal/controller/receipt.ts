export function formatReceiptDate(value: unknown, locale: string): string {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(date);
}

export function receiptStatus(value: unknown, copy: (name: string) => string): string {
    return statusLabels[String(value)]?.(copy) || copy("status-submitted-label");
}

const statusLabels: Record<string, (copy: (name: string) => string) => string> = {
    submitted: (copy) => copy("status-submitted-label"),
    under_review: (copy) => copy("status-under-review-label"),
    information_requested: (copy) => copy("status-information-requested-label"),
    resolved: (copy) => copy("status-resolved-label"),
};

export function safeFilePart(value: string): string {
    return (
        value
            .replace(/[^a-z0-9_-]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "receipt"
    );
}

export function receiptText(receipt: Record<string, unknown>, copy: (name: string) => string, locale: string): string {
    return [
        copy("receipt-title"),
        `${copy("receipt-reference-label")}: ${String(receipt.publicId || copy("receipt-unavailable-label"))}`,
        `${copy("receipt-order-label")}: ${String(receipt.orderNumber || receipt.orderPublicId || receipt.orderId || copy("receipt-unavailable-label"))}`,
        `${copy("date-label")}: ${formatReceiptDate(receipt.confirmedAt || receipt.submittedAt, locale)}`,
        `${copy("status-label")}: ${receiptStatus(receipt.status, copy)}`,
        `${copy("receipt-scope-label")}: ${String(receipt.serviceScope || "")}`,
        "",
        copy("receipt-notice"),
    ].join("\n");
}

export function newIdempotencyKey(): string {
    return typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function downloadReceipt(
    document: Document,
    receipt: Record<string, unknown>,
    copy: (name: string) => string,
    locale: string,
): void {
    const reference = String(receipt.publicId || "").trim();
    const content = receiptText(receipt, copy, locale);
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `marketplace-service-withdrawal-${safeFilePart(reference || "receipt")}.txt`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
