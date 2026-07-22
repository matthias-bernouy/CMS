import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { claimReturnEventSources } from "./sources";
import { claims, shipment, tracking, type EventKind } from "./fixtures";

export type CapturedCall = { url: URL; method: string; body: unknown };
export type Responder = (request: Request) => Response | Promise<Response>;

const functionIds = {
    carrier: "recordMondialRelayClaimReturnCarrierAcceptance",
    handoff: "recordMondialRelayClaimReturnRecipientHandoff",
} as const;

export async function executeClaimReturnEvent(
    kind: EventKind,
    responder: Responder,
    options: { request?: Request; user?: { id: string; role: string } } = {},
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const fn = await loadFunction(kind);
    const response = await executeFunction(fn, options.request ?? eventRequest(kind), {
        sources: await claimReturnEventSources(),
        user: options.user ?? { id: "system", role: "admin" },
        deps: {
            fetchImpl: async (input, init) => {
                const outgoing = new Request(input, init);
                calls.push({
                    url: new URL(outgoing.url),
                    method: outgoing.method,
                    body: outgoing.body ? await outgoing.clone().json() : undefined,
                });
                return await responder(outgoing);
            },
        },
    });
    return { response, calls };
}

export function eventRequest(kind: EventKind, body: unknown = { claimId: 7, expeditionNumber: "87654321" }) {
    return new Request(`https://cms.test/functions/${functionIds[kind]}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function successfulResponder(
    kind: EventKind,
    overrides: { shipment?: object; tracking?: object; claim?: object } = {},
): Responder {
    return (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/shipmentTrackingContext") {
            return Response.json({
                shipment: { ...shipment, ...overrides.shipment },
                tracking: { ...tracking, ...overrides.tracking },
            });
        }
        if (path === "/shipment") {
            return Response.json({ ...shipment, ...overrides.shipment });
        }
        if (path === "/tracking") {
            return Response.json({ ...tracking, ...overrides.tracking });
        }
        if (path === "/recordClaimReturnDelivery") {
            return Response.json({ ...claims[kind], ...overrides.claim });
        }
        throw new Error(`unexpected request: ${request.url}`);
    };
}

export async function loadFunction(kind: EventKind) {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-mondial-relay-fulfillment",
    );
    const id = functionIds[kind];
    const artifact = definition?.artifacts?.find((item) => item.type === "function" && item.function.id === id);
    if (!artifact || artifact.type !== "function") {
        throw new Error(`${id} function not found`);
    }
    const fn = structuredClone(artifact.function);
    resolveSources(fn);
    return fn;
}

function resolveSources(value: unknown): void {
    if (Array.isArray(value)) {
        value.forEach(resolveSources);
        return;
    }
    if (!isRecord(value)) {
        return;
    }
    for (const [key, nested] of Object.entries(value)) {
        if (typeof nested === "string") {
            value[key] = nested
                .replaceAll("{{dependencies.delivery.sourceId}}", "delivery")
                .replaceAll("{{dependencies.commerce.sourceId}}", "commerce");
        } else {
            resolveSources(nested);
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
