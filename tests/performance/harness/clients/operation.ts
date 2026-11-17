import { ClientFailure } from "./failure";
import type { ClientCall } from "./types";
import type { ScenarioClient } from "./session";

/** The durable result must be read through a real, authenticated, admitted status capability. */
export function operationCompletion(
    client: ScenarioClient,
    contractId: string,
    capabilityId: string,
    input: (operationId: string) => Readonly<Record<string, unknown>>,
): NonNullable<ClientCall["complete"]> {
    return async (operationId, signal, recordPoll) => {
        for (let attempt = 0; attempt < 150; attempt++) {
            signal.throwIfAborted();
            const response = await client(contractId, capabilityId, "http", input(operationId), undefined, { signal });
            recordPoll(response.observation);
            if (!response.observation.validated || !response.output || typeof response.output !== "object") {
                throw new ClientFailure("operation-status-invalid");
            }
            const state = response.output as Readonly<Record<string, unknown>>;
            if (
                state.operationId !== operationId ||
                !["queued", "running", "succeeded", "failed"].includes(String(state.status))
            ) {
                throw new ClientFailure("operation-status-mismatch");
            }
            if (state.status === "failed") {
                throw new ClientFailure("operation-terminal-failed");
            }
            if (state.status === "succeeded") {
                if (!Object.hasOwn(state, "result")) {
                    throw new ClientFailure("operation-result-missing");
                }
                return state.result;
            }
            await Bun.sleep(200);
        }
        throw new ClientFailure("operation-poll-limit-exceeded");
    };
}

export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    let abort: () => void = () => {};
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                abort = () => reject(signal.reason);
                signal.addEventListener("abort", abort, { once: true });
            }),
        ]);
    } finally {
        signal.removeEventListener("abort", abort);
    }
}
