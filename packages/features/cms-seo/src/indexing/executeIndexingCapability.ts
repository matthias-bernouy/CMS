import { GatewayError, type GatewayActor, type GatewayInvoker } from "@bernouy/cms-gateway";

export type IndexingCapabilityRuntime = {
    readonly siteId: string;
    readonly invoker: Pick<GatewayInvoker, "invoke">;
};

/** Invokes the selected release directly; no public HTTP route or Source proxy is involved. */
export async function executeIndexingCapability(
    runtime: IndexingCapabilityRuntime | null | undefined,
    actor: GatewayActor,
    contractId: string,
    capabilityId: string,
    input: Readonly<Record<string, string | number>>,
): Promise<Response> {
    if (!runtime) {
        return new Response(null, { status: 503 });
    }
    try {
        const result = await runtime.invoker.invoke({
            siteId: runtime.siteId,
            contractId,
            capabilityId,
            input,
            actor,
        });
        if (result.kind === "binary") {
            return new Response(null, { status: 502 });
        }
        return Response.json(result.output ?? null, { status: result.status });
    } catch (error) {
        if (error instanceof GatewayError) {
            const status = error.code === "invalid_input" ? 400 : error.code === "not_authorized" ? 403 : 503;
            return new Response(null, { status });
        }
        return new Response(null, { status: 503 });
    }
}
