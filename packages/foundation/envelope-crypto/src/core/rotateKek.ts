import type { DekRepository } from "envelope-crypto/interfaces/DekRepository";
import type { KekProvider } from "envelope-crypto/interfaces/KekProvider";

const DEFAULT_BATCH_SIZE = 250;

export type KekRotationReport = Readonly<{
    inspected: number;
    rewrapped: number;
    activeKeyId: string;
}>;

export async function verifyDekKeyAvailability(
    provider: KekProvider,
    repository: DekRepository,
    batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
    let cursor: string | null = null;
    let inspected = 0;
    do {
        const page = await repository.list(cursor, batchSize);
        for (const record of page.items) {
            inspected += 1;
            if (!provider.hasKey(record.keyId)) {
                throw new Error(
                    `Envelope key readiness failed: scope "${record.scopeId}" references unavailable KEK "${record.keyId}".`,
                );
            }
        }
        cursor = page.nextCursor;
    } while (cursor);
    return inspected;
}

/** Rewraps DEKs only; ciphertext encrypted by each DEK remains unchanged. */
export async function rotateDekWrapping(
    provider: KekProvider,
    repository: DekRepository,
    options: {
        batchSize?: number;
        signal?: AbortSignal;
        now?: () => Date;
        onRewrapped?: (event: { scopeId: string; previousKeyId: string; activeKeyId: string }) => Promise<void> | void;
    } = {},
): Promise<KekRotationReport> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    let cursor: string | null = null;
    let inspected = 0;
    let rewrapped = 0;
    do {
        options.signal?.throwIfAborted();
        const page = await repository.list(cursor, batchSize);
        for (const record of page.items) {
            options.signal?.throwIfAborted();
            inspected += 1;
            if (record.keyId === provider.activeKeyId) {
                continue;
            }
            if (!provider.hasKey(record.keyId)) {
                throw new Error(
                    `Envelope key rotation failed: scope "${record.scopeId}" references unavailable KEK "${record.keyId}".`,
                );
            }
            const plaintext = await provider.unwrap(record.wrapped, record.keyId);
            try {
                const next = await provider.wrap(plaintext);
                const changed = await repository.rewrap(
                    record.scopeId,
                    { wrapped: record.wrapped, keyId: record.keyId },
                    { wrapped: next.wrapped, keyId: next.keyId, rotatedAt: options.now?.() ?? new Date() },
                );
                if (!changed) {
                    throw new Error(`Envelope key rotation conflicted for scope "${record.scopeId}"; retry safely.`);
                }
                rewrapped += 1;
                await options.onRewrapped?.({
                    scopeId: record.scopeId,
                    previousKeyId: record.keyId,
                    activeKeyId: next.keyId,
                });
            } finally {
                plaintext.fill(0);
            }
        }
        cursor = page.nextCursor;
    } while (cursor);
    return { inspected, rewrapped, activeKeyId: provider.activeKeyId };
}
