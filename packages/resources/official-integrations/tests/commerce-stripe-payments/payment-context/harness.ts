import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { paymentSources } from "./sources";

export type PaymentFunctionId =
    | "getPaymentForOrder"
    | "refreshPaymentForOrder";

export type CapturedCall = {
    url: URL;
    method: string;
    headers: Headers;
    body: unknown;
};

type Responder = (request: Request) => Response | Promise<Response>;
type User = { id: string; role: string };

export async function executePaymentWorkflow(
    id: PaymentFunctionId,
    request: Request,
    responder: Responder,
    user: User | null = { id: "buyer-user", role: "user" },
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const fn = await loadPaymentFunction(id);
    const sources = await paymentSources();
    const response = await executeFunction(fn, request, {
        sources,
        user: user ?? undefined,
        deps: {
            fetchImpl: async (input, init) => {
                const outgoing = new Request(input, init);
                calls.push({
                    url: new URL(outgoing.url),
                    method: outgoing.method,
                    headers: new Headers(outgoing.headers),
                    body: await requestBody(outgoing),
                });
                return await responder(outgoing);
            },
        },
    });
    return { response, calls };
}

export async function loadPaymentFunction(id: PaymentFunctionId) {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-stripe-payments");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function" && item.function.id === id
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error(`${id} function not found`);
    }
    const fn = structuredClone(artifact.function);
    for (const step of fn.steps) {
        if (!("call" in step)) continue;
        if (step.call.source === "{{dependencies.commerce.sourceId}}") {
            step.call.source = "commerce";
        } else if (step.call.source === "{{dependencies.stripe.sourceId}}") {
            step.call.source = "stripe-connect";
        }
    }
    return fn;
}

export function getRequest(orderId = 42): Request {
    return new Request(
        `https://cms.test/functions/getPaymentForOrder?orderId=${orderId}`,
    );
}

export function refreshRequest(body: unknown = { orderId: 42 }): Request {
    return new Request("https://cms.test/functions/refreshPaymentForOrder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function requestBody(request: Request): Promise<unknown> {
    const text = await request.clone().text();
    if (!text) return null;
    return request.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text;
}
