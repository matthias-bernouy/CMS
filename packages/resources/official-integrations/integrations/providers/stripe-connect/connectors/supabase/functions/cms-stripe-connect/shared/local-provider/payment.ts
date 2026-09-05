import type { JsonRecord } from "../types.ts";
import { stableSuffix } from "./common.ts";

type LocalPaymentSeed = {
    amount: number;
    currency: string;
    transferGroup: string;
    paymentId: string;
    clientReferenceId: string;
    financialTermsHash: string;
    sellerCmsUserId: string;
};

export function localPaymentIntent(body: URLSearchParams): JsonRecord {
    const seed: LocalPaymentSeed = {
        amount: Number(body.get("amount")),
        currency: body.get("currency") ?? "eur",
        transferGroup: body.get("transfer_group") ?? "",
        paymentId: body.get("metadata[cms_payment_id]") ?? "missing",
        clientReferenceId: body.get("metadata[client_reference_id]") ?? "",
        financialTermsHash: body.get("metadata[financial_terms_hash]") ?? "",
        sellerCmsUserId: body.get("metadata[seller_cms_user_id]") ?? "",
    };
    return paymentIntent(seed, `pi_local_v1_${encodeSeed(seed)}`);
}

export function reviveLocalPaymentIntent(id: string): JsonRecord | null {
    const encoded = id.startsWith("pi_local_v1_") ? id.slice("pi_local_v1_".length) : "";
    const seed = decodeSeed(encoded);
    return seed ? paymentIntent(seed, id) : null;
}

function paymentIntent(seed: LocalPaymentSeed, id: string): JsonRecord {
    const fee = Math.min(seed.amount, 250);
    return {
        id,
        client_secret: `${id}_secret_local`,
        status: "succeeded",
        amount: seed.amount,
        amount_received: seed.amount,
        currency: seed.currency,
        transfer_group: seed.transferGroup,
        metadata: {
            cms_payment_id: seed.paymentId,
            client_reference_id: seed.clientReferenceId,
            financial_terms_hash: seed.financialTermsHash,
            seller_cms_user_id: seed.sellerCmsUserId,
        },
        latest_charge: {
            id: `ch_local_${stableSuffix(seed.paymentId)}`,
            payment_intent: id,
            amount: seed.amount,
            amount_captured: seed.amount,
            amount_refunded: 0,
            currency: seed.currency,
            transfer_group: seed.transferGroup,
            paid: true,
            captured: true,
            balance_transaction: {
                id: `txn_local_${stableSuffix(seed.paymentId)}`,
                amount: seed.amount,
                fee,
                net: seed.amount - fee,
                currency: seed.currency,
                fee_details: [],
            },
        },
    };
}

function encodeSeed(seed: LocalPaymentSeed): string {
    const bytes = new TextEncoder().encode(JSON.stringify(seed));
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeSeed(encoded: string): LocalPaymentSeed | null {
    try {
        const base64 = encoded
            .replaceAll("-", "+")
            .replaceAll("_", "/")
            .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
        const binary = atob(base64);
        const value = JSON.parse(
            new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))),
        );
        return isLocalPaymentSeed(value) ? value : null;
    } catch {
        return null;
    }
}

function isLocalPaymentSeed(value: unknown): value is LocalPaymentSeed {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const seed = value as Record<string, unknown>;
    return (
        Number.isSafeInteger(seed.amount) &&
        Number(seed.amount) >= 0 &&
        ["currency", "transferGroup", "paymentId", "clientReferenceId", "financialTermsHash", "sellerCmsUserId"].every(
            (field) => typeof seed[field] === "string",
        )
    );
}
