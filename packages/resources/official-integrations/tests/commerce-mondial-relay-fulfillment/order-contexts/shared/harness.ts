import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import type { InMemorySourceRepository } from "@bernouy/cms-sources";
import { buyerId } from "./fixtures";
import { fulfillmentContextSources } from "./sources";

export type CapturedCall = {
    url: URL;
    method: string;
    body: unknown;
    userId: string | null;
};

export type Responder = (request: Request) => Response | Promise<Response>;
export type User = { id: string; role: string };

export async function executeBuyerTracking(
    responder: Responder,
    options: {
        request?: Request;
        user?: User | null;
    } = {},
): Promise<{ response: Response; calls: CapturedCall[] }> {
    return await executeFulfillmentFunction({
        functionId: "getShipmentForOrder",
        request: options.request ?? buyerTrackingRequest(),
        responder,
        sources: await fulfillmentContextSources(),
        user: options.user === null
            ? undefined
            : options.user ?? { id: buyerId, role: "user" },
    });
}

export async function executeFulfillmentFunction(options: {
    functionId: string;
    request: Request;
    responder: Responder;
    sources: InMemorySourceRepository;
    user?: User;
}): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const response = await executeFunction(
        await loadFulfillmentFunction(options.functionId),
        options.request,
        {
            sources: options.sources,
            user: options.user,
            deps: {
                fetchImpl: async (input, init) => {
                    const outgoing = new Request(input, init);
                    calls.push({
                        url: new URL(outgoing.url),
                        method: outgoing.method,
                        body: await requestBody(outgoing),
                        userId: outgoing.headers.get("x-cms-user-id"),
                    });
                    return await options.responder(outgoing);
                },
            },
        },
    );
    return { response, calls };
}

export async function loadBuyerTrackingFunction() {
    return await loadFulfillmentFunction("getShipmentForOrder");
}

export async function loadFulfillmentFunction(functionId: string) {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-mondial-relay-fulfillment");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function"
        && item.function.id === functionId
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error(`${functionId} function not found`);
    }
    const fn = structuredClone(artifact.function);
    resolveDependencySources(fn);
    return fn;
}

export function buyerTrackingRequest(
    orderId: string | number = 42,
): Request {
    return new Request(
        `https://cms.test/functions/getShipmentForOrder?orderId=${orderId}`,
    );
}

export async function expectGenericFailure(
    response: Response,
): Promise<void> {
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
        error: "Function execution failed",
        correlationId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("Private Street");
    expect(JSON.stringify(body)).not.toContain("provider");
}

async function requestBody(request: Request): Promise<unknown> {
    if (request.body === null) return undefined;
    return await request.clone().json();
}

function resolveDependencySources(value: unknown): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            if (typeof item === "string") {
                value[index] = resolveDependencySource(item);
            } else {
                resolveDependencySources(item);
            }
        });
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
        if (typeof nested === "string") {
            value[key] = resolveDependencySource(nested);
        } else {
            resolveDependencySources(nested);
        }
    }
}

function resolveDependencySource(value: string): string {
    return value
        .replaceAll("{{dependencies.commerce.sourceId}}", "commerce")
        .replaceAll("{{dependencies.delivery.sourceId}}", "delivery");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object"
        && !Array.isArray(value);
}
