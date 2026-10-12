import type { TPage } from "@bernouy/cms-content/rendering";
import type KernelCms from "cms-kernel/KernelCms";
import { executeIndexingCapability } from "cms-kernel/core/seo/indexing/executeIndexingCapability";
import {
    resolvePageIndexingMetadata,
    type PageIndexingMetadataResult,
} from "cms-kernel/core/seo/indexing/resolvePageIndexingMetadata";

export function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    kernel: KernelCms,
): Promise<PageIndexingMetadataResult> {
    return resolvePageIndexingMetadata(request, page, (contractId, capabilityId, input) =>
        executeIndexingCapability(kernel, request, contractId, capabilityId, input),
    );
}
