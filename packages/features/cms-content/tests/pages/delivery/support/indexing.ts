import type { GatewayActor, GatewayInvoker } from "@bernouy/cms-gateway";
export async function executeIndexingCapability(
    runtime: { siteId: string; invoker: Pick<GatewayInvoker, "invoke"> } | undefined,
    actor: GatewayActor,
    contractId: string,
    capabilityId: string,
    input: Readonly<Record<string, string | number>>,
): Promise<Response> {
    if (!runtime) {
        return new Response(null, { status: 503 });
    }
    try {
        const result = await runtime.invoker.invoke({ siteId: runtime.siteId, actor, contractId, capabilityId, input });
        return result.kind === "success"
            ? Response.json(result.output ?? null, { status: result.status ?? 200 })
            : new Response(null, { status: 503 });
    } catch {
        return new Response(null, { status: 503 });
    }
}
