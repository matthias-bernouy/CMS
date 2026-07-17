import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buyerId } from "./fixtures";
import { fulfillmentContextSources } from "./sources";

export type CapturedCall = {
    url: URL;
    method: string;
    body: unknown;
    userId: string | null;
};

type Responder = (request: Request) => Response | Promise<Response>;
type User = { id: string; role: string };

export async function executeBuyerTracking(
    responder: Responder,
    options: {
        request?: Request;
        user?: User | null;
    } = {},
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const response = await executeFunction(
        await loadBuyerTrackingFunction(),
        options.request ?? buyerTrackingRequest(),
        {
            sources: await fulfillmentContextSources(),
            user: options.user === null
                ? undefined
                : options.user ?? { id: buyerId, role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const outgoing = new Request(input, init);
                    calls.push({
                        url: new URL(outgoing.url),
                        method: outgoing.method,
                        body: await requestBody(outgoing),
                        userId: outgoing.headers.get("x-cms-user-id"),
                    });
                    return await responder(outgoing);
                },
            },
        },
    );
    return { response, calls };
}

export async function loadBuyerTrackingFunction() {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-mondial-relay-fulfillment");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function"
        && item.function.id === "getShipmentForOrder"
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error("getShipmentForOrder function not found");
    }
    const fn = structuredClone(artifact.function);
    resolveDependencySources(fn.steps);
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
        for (const item of value) resolveDependencySources(item);
        return;
    }
    if (!isRecord(value)) return;
    if (isRecord(value.call)) {
        if (value.call.source === "{{dependencies.commerce.sourceId}}") {
            value.call.source = "commerce";
        } else if (
            value.call.source === "{{dependencies.delivery.sourceId}}"
        ) {
            value.call.source = "delivery";
        }
    }
    for (const nested of Object.values(value)) {
        resolveDependencySources(nested);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object"
        && !Array.isArray(value);
}
