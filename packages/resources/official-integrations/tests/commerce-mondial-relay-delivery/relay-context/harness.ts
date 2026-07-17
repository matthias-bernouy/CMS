import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buyerId } from "./fixtures";
import { relaySources } from "./sources";

export type RelayFunctionId = "setRelayPointForOrder" | "getRelayPointForOrder";
export type CapturedCall = {
    url: URL;
    method: string;
    body: unknown;
    userId: string | null;
    accountUserId: string | null;
};
type Responder = (request: Request) => Response | Promise<Response>;

export async function executeRelay(
    id: RelayFunctionId,
    responder: Responder,
    options: {
        request?: Request;
        user?: { id: string; role: string } | null;
    } = {},
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const response = await executeFunction(
        await loadRelayFunction(id),
        options.request ?? relayRequest(id),
        {
            sources: await relaySources(),
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
                        accountUserId: outgoing.headers.get("x-user-id"),
                    });
                    return await responder(outgoing);
                },
            },
        },
    );
    return { response, calls };
}

export async function loadRelayFunction(id: RelayFunctionId) {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-mondial-relay-delivery");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function" && item.function.id === id
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error(`${id} function not found`);
    }
    const fn = structuredClone(artifact.function);
    resolveDependencySources(fn.steps);
    return fn;
}

export function relayRequest(id: RelayFunctionId): Request {
    if (id === "getRelayPointForOrder") {
        return new Request(
            "https://cms.test/functions/getRelayPointForOrder?orderId=42",
        );
    }
    return new Request(
        "https://cms.test/functions/setRelayPointForOrder",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                orderId: "42",
                relayLocation: "FR-024474",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
            }),
        },
    );
}

export async function expectGenericFailure(response: Response): Promise<void> {
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
    if (isRecord(value.call) && typeof value.call.source === "string") {
        const match = /^\{\{dependencies\.([^.]+)\.sourceId\}\}$/.exec(
            value.call.source,
        );
        if (match) value.call.source = match[1]!;
    }
    for (const nested of Object.values(value)) resolveDependencySources(nested);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
