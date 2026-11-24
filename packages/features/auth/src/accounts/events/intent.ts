import { accountCreatedPayload, emailVerifiedPayload } from "./schemas";
import { accountEventCausation } from "./context";
import { z } from "zod";
import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { AccountEventIntent, AccountEventType, EmailVerificationEvidence } from "./interfaces";

const timestamp = z.string().datetime({ precision: 3 });
export const verificationEvidence = z.strictObject({
    accountRef: z.string().uuid().optional(),
    method: z.enum(["email-link", "password-reset"]),
    accountCreatedAt: timestamp,
});
const record = z.strictObject({
    occurrenceId: z.string().uuid(),
    type: z.enum(["account.created", "account.email-verified"]),
    accountId: z.string().min(1).max(200),
    accountRef: z.string().uuid(),
    accountCreatedAt: timestamp,
    occurredAt: timestamp,
    causation: z
        .array(z.string().regex(/^[a-f0-9]{64}$/u))
        .max(32)
        .readonly(),
    payloadJson: z.string().min(1).max(4096),
    state: z.enum(["pending", "sending", "expired"]),
    attempts: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    token: z.string().uuid().nullable(),
    dueAt: timestamp.nullable(),
    errorCode: z.string().max(64).nullable(),
});
function parseAccountEventIntent(value: unknown): AccountEventIntent {
    const parsed = record.parse(value);
    if (
        (parsed.state === "sending") !== (parsed.token !== null) ||
        (parsed.state === "expired") !== (parsed.dueAt === null)
    ) {
        throw new TypeError("Invalid account Event state");
    }
    const payload =
        parsed.type === "account.created"
            ? accountCreatedPayload.parse(parseStrictJson(new TextEncoder().encode(parsed.payloadJson), 4096, 16))
            : emailVerifiedPayload.parse(parseStrictJson(new TextEncoder().encode(parsed.payloadJson), 4096, 16));
    const createdAt = "createdAt" in payload ? payload.createdAt : payload.accountCreatedAt;
    const occurredAt = "createdAt" in payload ? payload.createdAt : payload.verifiedAt;
    if (
        canonicalizeIJson(payload) !== parsed.payloadJson ||
        payload.accountRef !== parsed.accountRef ||
        createdAt !== parsed.accountCreatedAt ||
        occurredAt !== parsed.occurredAt
    ) {
        throw new TypeError("Invalid account Event payload");
    }
    return parsed;
}
export function accountEventIntent(value: unknown): AccountEventIntent {
    try {
        return parseAccountEventIntent(value);
    } catch {
        throw new TypeError("Invalid account Event record");
    }
}
function create(
    type: AccountEventType,
    accountId: string,
    accountCreatedAt: string,
    at: Date,
    data: unknown,
    accountRef: string,
): AccountEventIntent {
    return accountEventIntent({
        occurrenceId: crypto.randomUUID(),
        type,
        accountId,
        accountRef,
        accountCreatedAt,
        causation: accountEventCausation(),
        occurredAt: at.toISOString(),
        payloadJson: canonicalizeIJson(data),
        state: "pending",
        attempts: 0,
        token: null,
        dueAt: at.toISOString(),
        errorCode: null,
    });
}
export function accountCreatedIntent(accountId: string, provider: string | undefined, at: Date, accountRef: string) {
    return create(
        "account.created",
        accountId,
        at.toISOString(),
        at,
        {
            accountRef,
            provider: provider || "unknown",
            createdAt: at.toISOString(),
        },
        accountRef,
    );
}
export function emailVerifiedIntent(accountId: string, evidence: EmailVerificationEvidence, at: Date) {
    const proof = verificationEvidence.parse(evidence);
    if (!proof.accountRef) {
        throw new TypeError("Account Event reference is required");
    }
    return create(
        "account.email-verified",
        accountId,
        proof.accountCreatedAt,
        at,
        {
            accountRef: proof.accountRef,
            accountCreatedAt: proof.accountCreatedAt,
            verifiedAt: at.toISOString(),
            method: proof.method,
        },
        proof.accountRef,
    );
}
