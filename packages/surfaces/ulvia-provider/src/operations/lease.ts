import type { ProviderOperationExecutionContext } from "./types";

export class ProviderOperationLeaseLostError extends Error {
    constructor() {
        super("Provider operation lease was lost.");
        this.name = "ProviderOperationLeaseLostError";
    }
}

export function operationExecution(token: string, signal: AbortSignal): ProviderOperationExecutionContext {
    return {
        signal,
        leaseToken: token,
        throwIfLeaseLost() {
            if (signal.aborted) {
                throw signal.reason instanceof Error ? signal.reason : new ProviderOperationLeaseLostError();
            }
        },
    };
}

export function expiresAt(now: Date, leaseMs: number): string {
    return new Date(now.getTime() + leaseMs).toISOString();
}

export async function waitForLeaseRenewal(milliseconds: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
        return true;
    }
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener("abort", aborted);
            resolve(false);
        }, milliseconds);
        const aborted = () => {
            clearTimeout(timeout);
            resolve(true);
        };
        signal.addEventListener("abort", aborted, { once: true });
    });
}
