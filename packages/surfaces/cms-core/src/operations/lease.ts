import type { CoreOperationExecutionContext } from "./types";

export class CoreOperationLeaseLostError extends Error {
    constructor() {
        super("Core operation lease was lost.");
        this.name = "CoreOperationLeaseLostError";
    }
}

export function operationExecution(token: string, signal: AbortSignal): CoreOperationExecutionContext {
    return {
        signal,
        leaseToken: token,
        throwIfLeaseLost() {
            if (signal.aborted) {
                throw signal.reason instanceof Error ? signal.reason : new CoreOperationLeaseLostError();
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
