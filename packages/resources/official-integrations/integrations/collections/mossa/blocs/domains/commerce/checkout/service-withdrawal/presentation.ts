import { readWithdrawalCopy } from "./copy";
import { formatReceiptDate, receiptStatus } from "./controller/receipt";

type ObjectValue = Record<string, unknown>;

export function withdrawalPresentation(host: HTMLElement, ordersValue: unknown, submissionValue?: unknown) {
    const response = objectValue(ordersValue) || {};
    const submission = objectValue(submissionValue);
    const receipt = objectValue(submission?.body);
    const copy = (name: string, values: Record<string, string> = {}) => readWithdrawalCopy(host, name, values);
    return {
        confirmationLabel: copy("confirmation-label"),
        dateLabel: copy("date-label"),
        downloadLabel: copy("download-label"),
        emptyMessage: host.getAttribute("empty-message") || "No order is available on this account.",
        errorMessage: host.getAttribute("error-message") || "Your orders could not be loaded. Sign in and try again.",
        errorTitle: host.getAttribute("error-title") || "Request unavailable",
        formDescription: copy("form-description"),
        formTitle: copy("form-title"),
        loadingLabel: copy("loading-label"),
        orderLabel: copy("order-label"),
        orders: objectValues(response.items).map((order) => ({
            id: order.id,
            label: orderLabel(order, copy),
        })),
        reasonLabel: copy("reason-label"),
        reasonPlaceholder: copy("reason-placeholder"),
        receiptConfirmedAt: receipt ? formatReceiptDate(receipt.confirmedAt || receipt.submittedAt, locale(host)) : "",
        receiptOrder: receipt?.orderNumber || receipt?.orderPublicId || receipt?.orderId || "",
        receiptOrderLabel: copy("receipt-order-label"),
        receiptReference: receipt?.publicId || "",
        receiptStatus: receipt ? receiptStatus(receipt.status, copy) : "",
        referenceLabel: copy("reference-label"),
        retryLabel: copy("retry-label"),
        statusLabel: copy("status-label"),
        submitErrorMessage: copy("submit-error-message"),
        submitLabel: copy("submit-label"),
        successDescription: copy("success-description"),
        successTitle: copy("success-title"),
        termsAfterLabel: copy("terms-after-label"),
        termsBeforeLabel: copy("terms-before-label"),
    };
}

function orderLabel(order: ObjectValue, copy: (name: string, values?: Record<string, string>) => string): string {
    const summary = objectValue(order.lineSummary);
    const reference = String(
        order.orderNumber || order.publicId || copy("order-reference-label", { reference: String(order.id || "") }),
    );
    const title = String(summary?.firstTitle || "").trim();
    return title ? `${reference} — ${title}` : reference;
}

function locale(host: HTMLElement): string {
    return host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}
