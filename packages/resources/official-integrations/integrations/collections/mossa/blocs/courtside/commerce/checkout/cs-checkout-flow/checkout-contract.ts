export type CheckoutReference = { kind: "agreement"; id: string } | { kind: "offer"; id: string };

type JsonRecord = Record<string, unknown>;

export function checkoutReference(url: URL): CheckoutReference {
    if (url.searchParams.has("agreementId")) {
        return {
            kind: "agreement",
            id: url.searchParams.get("agreementId")?.trim() || "",
        };
    }
    return {
        kind: "offer",
        id: url.searchParams.get("offerId")?.trim() || "",
    };
}

export function protectedOrderPayload(
    reference: CheckoutReference,
    offerId: unknown,
    idempotencyKey: string,
    address: JsonRecord,
    metadata: JsonRecord,
): JsonRecord {
    const checkout = {
        idempotencyKey,
        shippingAddress: address,
        billingAddress: address,
        metadata,
    };
    return reference.kind === "agreement"
        ? { ...checkout, agreementId: reference.id }
        : { ...checkout, items: [{ offerId: String(offerId), quantity: 1 }] };
}

export function checkoutReturnPath(reference: CheckoutReference, orderId: string): string {
    const query = new URLSearchParams({
        [reference.kind === "agreement" ? "agreementId" : "offerId"]: reference.id,
        orderId,
    });
    return `/checkout?${query.toString()}`;
}

export function idempotencyStorageKey(reference: CheckoutReference): string {
    return `courtside:checkout:${reference.kind}:${reference.id}`;
}
