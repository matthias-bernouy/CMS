import type { TPage } from "@bernouy/cms-content/rendering";
import { GatewayError, type GatewayActor, type GatewayInvoker } from "@bernouy/cms-gateway";
import { resolvePageIndexingMetadata, type PageIndexingMetadataResult } from "@bernouy/cms-content/seo";
import type KernelCms from "cms-kernel/KernelCms";
import { resolveRequestActor } from "./access/resolveRequestActor";

/** Adapt Kernel identity and Gateway state to the SEO indexing feature. */
export async function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    kernel: KernelCms,
): Promise<PageIndexingMetadataResult> {
    const actor = await indexingActor(kernel, request);
    return resolvePageIndexingMetadata(request, page, (contractId, capabilityId, input) =>
        executeIndexingCapability(kernel.capabilityGateway, actor, contractId, capabilityId, input),
    );
}

async function indexingActor(kernel: KernelCms, request: Request): Promise<GatewayActor> {
    return resolveRequestActor(kernel, request);
}

export async function executeIndexingCapability(
    runtime: { readonly siteId: string; readonly invoker: Pick<GatewayInvoker, "invoke"> } | null | undefined,
    actor: GatewayActor,
    contractId: string,
    capabilityId: string,
    input: Readonly<Record<string, string | number>>,
): Promise<Response> {
    if (!runtime) {
        return new Response(null, { status: 503 });
    }
    try {
        const result = await runtime.invoker.invoke({ siteId: runtime.siteId, contractId, capabilityId, input, actor });
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
