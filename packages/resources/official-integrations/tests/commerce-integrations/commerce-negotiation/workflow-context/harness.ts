import { executeFunction } from "@bernouy/cms-functions";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { workflowSources } from "./sources";

export type CapturedCall = {
    url: URL;
    method: string;
    headers: Headers;
    body: unknown;
};

type Responder = (request: Request) => Response | Promise<Response>;
type User = { id: string; role: string };

export async function executeNegotiationWorkflow(
    id: "getProposalPolicy" | "createMyProposal",
    request: Request,
    responder: Responder,
    user: User | null = { id: "buyer-user", role: "user" },
): Promise<{ response: Response; calls: CapturedCall[] }> {
    const calls: CapturedCall[] = [];
    const fn = await loadNegotiationFunction(id);
    const sources = await workflowSources();
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

export async function loadNegotiationFunction(id: string) {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-negotiation",
    );
    const artifact = definition?.artifacts?.find((item) => item.type === "function" && item.function.id === id);
    if (!artifact || artifact.type !== "function") {
        throw new Error(`${id} function not found`);
    }
    const fn = structuredClone(artifact.function);
    for (const step of fn.steps) {
        if (!("call" in step)) {
            continue;
        }
        if (step.call.source === "{{dependencies.commerce.sourceId}}") {
            step.call.source = "commerce";
        } else if (step.call.source === "{{answers.id}}") {
            step.call.source = "commerce-negotiation";
        }
    }
    return fn;
}

async function requestBody(request: Request): Promise<unknown> {
    const text = await request.clone().text();
    if (!text) {
        return null;
    }
    return request.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text;
}
