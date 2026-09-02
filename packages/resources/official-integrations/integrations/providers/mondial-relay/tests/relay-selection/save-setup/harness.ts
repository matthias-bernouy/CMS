import { buyerId, checkoutBody, claimBody, type JsonRecord } from "./fixtures.ts";

export type SaveRoute = "checkout" | "claim-return";
export type FailureStep = "shipment" | "settings" | "provider" | "write";
export type LogicalStep = FailureStep;

export type SaveSetupOptions = {
    route?: SaveRoute;
    body?: JsonRecord;
    authorization?: string | null;
    userId?: string | null;
    shipmentExists?: boolean;
    settings?: JsonRecord | null;
    failure?: FailureStep;
};

export type ObservedRequest = {
    kind: "database" | "provider";
    method: string;
    pathname: string;
    search: string;
    body?: JsonRecord;
};

export type WorkerResult = {
    status: number;
    body: string;
    logicalSteps: LogicalStep[];
    requests: ObservedRequest[];
    error?: string;
};

const workerUrl = new URL("./worker.ts", import.meta.url).href;

export async function callSaveRoute(options: SaveSetupOptions = {}) {
    const route = options.route ?? "checkout";
    const result = await runWorker({
        ...options,
        route,
        body: options.body ?? (route === "checkout" ? checkoutBody() : claimBody()),
        authorization: options.authorization === undefined ? "Bearer delivery-test-key" : options.authorization,
        userId: options.userId === undefined ? buyerId : options.userId,
    });
    if (result.error) {
        throw new Error(result.error);
    }
    const response = new Response(result.body, {
        status: result.status,
        headers: { "content-type": "application/json" },
    });
    return {
        response,
        logicalSteps: result.logicalSteps,
        requests: result.requests,
        databaseRequests: result.requests.filter(({ kind }) => kind === "database"),
        providerRequests: result.requests.filter(({ kind }) => kind === "provider"),
    };
}

function runWorker(
    options: Required<Pick<SaveSetupOptions, "route" | "body">> & SaveSetupOptions,
): Promise<WorkerResult> {
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
        worker.postMessage(options);
    });
}
