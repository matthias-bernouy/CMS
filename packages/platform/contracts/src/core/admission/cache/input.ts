import { DEFAULT_RELEASE_LIMITS } from "ulvia-contracts/core/protocol/limits";
import type { ReleaseLimits } from "ulvia-contracts/core/protocol/limits";

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const limitKeys = Object.keys(DEFAULT_RELEASE_LIMITS) as (keyof ReleaseLimits)[];
export type StoredVerificationInput = Readonly<{ key: string; source: string; limits: Readonly<ReleaseLimits> }>;

/** Keys preserve exact JSON text and every validation limit; no digest-only admission lookup. */
export function storedVerificationInput(
    input: string | Uint8Array,
    digest: unknown,
    limits: Readonly<ReleaseLimits>,
): StoredVerificationInput | null {
    if (typeof digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(digest)) {
        return null;
    }
    const policy = snapshotPolicy(limits);
    if (!policy) {
        return null;
    }
    let source: string;
    if (typeof input === "string") {
        source = input;
    } else if (input instanceof Uint8Array && input.byteLength <= policy.maxDocumentBytes) {
        try {
            // Decode once, before yielding, so mutable buffers cannot change a pending cache key's input.
            source = decoder.decode(input);
        } catch {
            return null;
        }
    } else {
        return null;
    }
    if (source.length > policy.maxDocumentBytes || source.charCodeAt(0) === 0xfeff) {
        return null;
    }
    return {
        key: `${JSON.stringify(limitKeys.map((key) => policy[key]))}\0${digest}\0${source}`,
        source,
        limits: policy,
    };
}

function snapshotPolicy(limits: Readonly<ReleaseLimits>): Readonly<ReleaseLimits> | null {
    try {
        const descriptors = Object.getOwnPropertyDescriptors(limits);
        const policy = {} as ReleaseLimits;
        for (const key of limitKeys) {
            const value = descriptors[key]?.value;
            // Non-data/custom policies keep the original verification path and error order.
            if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
                return null;
            }
            policy[key] = value;
        }
        return Object.freeze(policy);
    } catch {
        return null;
    }
}
