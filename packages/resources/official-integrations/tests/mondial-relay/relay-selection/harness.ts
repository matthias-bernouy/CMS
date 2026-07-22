import { buyerId, type JsonRecord, orderId } from "./fixtures.ts";

export type HarnessOptions = {
    selection?: JsonRecord | null;
    quotes?: JsonRecord[];
    userHeader?: string | null;
    selectionError?: boolean;
    quoteError?: boolean;
    injectQuoteAfterSelection?: JsonRecord;
    rpcMalformed?: boolean;
};

export type ObservedRequest = { method: string; pathname: string; body?: JsonRecord };
export type WorkerResult = {
    status: number;
    body: string;
    logicalReads: Array<"selection" | "quote">;
    requests: ObservedRequest[];
    error?: string;
};

export const futureRpcPath = "/rest/v1/rpc/read_relay_selection_context";
const workerUrl = new URL("./worker.ts", import.meta.url).href;

export async function createRelaySelectionHarness(options: HarnessOptions = {}) {
    const logicalReads: Array<"selection" | "quote"> = [];
    const requests: ObservedRequest[] = [];
    const normalized = {
        ...options,
        userHeader: options.userHeader === undefined ? buyerId : options.userHeader,
    };

    return {
        logicalReads,
        requests,
        async call(externalOrderId = orderId): Promise<Response> {
            const result = await runWorker(normalized, externalOrderId);
            logicalReads.push(...result.logicalReads);
            requests.push(...result.requests);
            if (result.error) {
                throw new Error(result.error);
            }
            return new Response(result.body, {
                status: result.status,
                headers: { "content-type": "application/json" },
            });
        },
    };
}

function runWorker(options: HarnessOptions, externalOrderId: string): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerResult>) => {
            worker.terminate();
            resolve(event.data);
        };
        worker.onerror = (event) => {
            worker.terminate();
            reject(event.error ?? new Error(event.message));
        };
        worker.postMessage({ options, externalOrderId });
    });
}
