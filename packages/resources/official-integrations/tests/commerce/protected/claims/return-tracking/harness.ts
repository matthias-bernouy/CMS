import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { claimTrackingSources } from "./sources";

export type CapturedCall = {
    url: URL;
    method: string;
};

type Responder = (request: Request) => Response | Promise<Response>;
type User = { id: string; role: string };

export async function executeClaimTracking(
    responder: Responder,
    options: {
        request?: Request;
        user?: User | null;
    } = {},
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const response = await executeFunction(
        await loadClaimTrackingFunction(),
        options.request ?? claimTrackingRequest(),
        {
            sources: await claimTrackingSources(),
            user: options.user === null
                ? undefined
                : options.user ?? { id: "buyer-user", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const outgoing = new Request(input, init);
                    calls.push({
                        url: new URL(outgoing.url),
                        method: outgoing.method,
                    });
                    return await responder(outgoing);
                },
            },
        },
    );
    return { response, calls };
}

export async function loadClaimTrackingFunction() {
    const definition = await new FsIntegrationDefinitionRepository(
        OFFICIAL_INTEGRATIONS_ROOT,
    ).get("commerce-mondial-relay-fulfillment");
    const artifact = definition?.artifacts?.find(item =>
        item.type === "function"
        && item.function.id === "getClaimReturnForMe"
    );
    if (!artifact || artifact.type !== "function") {
        throw new Error("getClaimReturnForMe function not found");
    }
    const fn = structuredClone(artifact.function);
    resolveDependencySources(fn.steps);
    return fn;
}

export function claimTrackingRequest(claimId: string | number = 7): Request {
    return new Request(
        `https://cms.test/functions/getClaimReturnForMe?claimId=${claimId}`,
    );
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
        } else if (value.call.source === "{{dependencies.delivery.sourceId}}") {
            value.call.source = "delivery";
        }
    }
    for (const nested of Object.values(value)) resolveDependencySources(nested);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
