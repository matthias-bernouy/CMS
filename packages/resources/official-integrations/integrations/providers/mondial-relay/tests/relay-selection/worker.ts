import { type JsonRecord, orderId } from "./fixtures.ts";
import { futureRpcPath, type HarnessOptions, type ObservedRequest, type WorkerResult } from "./harness.ts";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type WorkerInput = { options: HarnessOptions; externalOrderId: string };

const edgeUrl = new URL("../../connectors/supabase/functions/cms-delivery/index.ts", import.meta.url).href;
let handler: EdgeHandler | undefined;

(globalThis as { Deno?: unknown }).Deno = {
    env: {
        get(name: string): string | undefined {
            return {
                CMS_DELIVERY_API_KEY: "delivery-test-key",
                SUPABASE_URL: "https://project.supabase.co",
                SUPABASE_SECRET_KEY: "sb_secret_delivery_test",
            }[name];
        },
    },
    serve(candidate: EdgeHandler) {
        handler = candidate;
        return { shutdown() {} };
    },
};

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
    try {
        postMessage(await run(event.data));
    } catch (error) {
        const result: WorkerResult = {
            status: 0,
            body: "",
            logicalReads: [],
            requests: [],
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        };
        postMessage(result);
    }
};

async function run({ options, externalOrderId }: WorkerInput): Promise<WorkerResult> {
    const selection = options.selection ?? null;
    const quotes = [...(options.quotes ?? [])];
    const logicalReads: Array<"selection" | "quote"> = [];
    const requests: ObservedRequest[] = [];

    function afterSelection(): void {
        if (options.injectQuoteAfterSelection) {
            quotes.push(options.injectQuoteAfterSelection);
        }
    }

    function selectedQuote(selectedOrderId: string, userId: string): JsonRecord | null {
        return (
            quotes
                .filter((row) => row.external_order_id === selectedOrderId && row.selected_for_cms_user_id === userId)
                .sort((left, right) => Number(right.revision) - Number(left.revision))[0] ?? null
        );
    }

    globalThis.fetch = (async (input, init) => {
        const request = input instanceof Request && !init ? input : new Request(String(input), init);
        const url = new URL(request.url);
        const bodyText = request.method === "GET" ? "" : await request.clone().text();
        const observed: ObservedRequest = { method: request.method, pathname: url.pathname };
        if (bodyText) {
            observed.body = JSON.parse(bodyText) as JsonRecord;
        }
        requests.push(observed);
        if (url.pathname === futureRpcPath) {
            if (options.rpcMalformed) {
                return jsonResponse({ outcome: "selection", row: null });
            }
            const selectedOrderId = String(observed.body?.p_external_order_id ?? "");
            const selectedFor = String(observed.body?.p_selected_for_cms_user_id ?? "");
            logicalReads.push("selection");
            if (options.selectionError) {
                return databaseFailure();
            }
            if (selection?.external_order_id === selectedOrderId) {
                return jsonResponse({ outcome: "selection", row: selection });
            }
            afterSelection();
            if (!selectedFor) {
                return jsonResponse({ outcome: "missing", row: null });
            }
            logicalReads.push("quote");
            if (options.quoteError) {
                return databaseFailure();
            }
            const quote = selectedQuote(selectedOrderId, selectedFor);
            return jsonResponse({ outcome: quote ? "quote" : "missing", row: quote });
        }
        if (url.pathname === "/rest/v1/relay_selections") {
            logicalReads.push("selection");
            if (options.selectionError) {
                return databaseFailure();
            }
            const selectedOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "") ?? "";
            const rows = selection?.external_order_id === selectedOrderId ? [selection] : [];
            afterSelection();
            return jsonResponse(rows);
        }
        if (url.pathname === "/rest/v1/delivery_quotes") {
            logicalReads.push("quote");
            if (options.quoteError) {
                return databaseFailure();
            }
            const selectedOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "") ?? "";
            const selectedFor = url.searchParams.get("selected_for_cms_user_id")?.replace(/^eq\./, "") ?? "";
            const quote = selectedQuote(selectedOrderId, selectedFor);
            return jsonResponse(quote ? [quote] : []);
        }
        throw new Error(`unexpected fetch ${request.method} ${url.pathname}`);
    }) as typeof fetch;

    await import(edgeUrl);
    if (!handler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    const headers = new Headers({ authorization: "Bearer delivery-test-key" });
    if (options.userHeader !== null) {
        headers.set("x-cms-user-id", options.userHeader ?? "");
    }
    const url = new URL("https://edge.test/cms-delivery/relay-selection");
    url.searchParams.set("externalOrderId", externalOrderId || orderId);
    const response = await handler(new Request(url, { headers }));
    return { status: response.status, body: await response.text(), logicalReads, requests };
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function databaseFailure(): Response {
    return jsonResponse({ message: "private relay selection database failure" }, 500);
}
