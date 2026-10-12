import type { TPage } from "@bernouy/cms-content/rendering";
import type { GatewayActor } from "@bernouy/cms-gateway";
import {
    executeIndexingCapability,
    resolvePageIndexingMetadata,
    type PageIndexingMetadataResult,
} from "@bernouy/cms-seo";
import type KernelCms from "cms-kernel/KernelCms";

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
    const subject = await kernel.authentication.getSubject(request).catch(() => null);
    return subject ? { kind: "user", subjectId: subject.identifier } : { kind: "anonymous" };
}
