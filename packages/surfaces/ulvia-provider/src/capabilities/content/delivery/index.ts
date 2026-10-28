import { parseResolvePathRequest } from "@bernouy/cms-content/public-delivery";
import { parseResourceMetadata } from "@bernouy/cms-gateway/protocol";
import {
    ProviderCapabilityDispatchError,
    type ProviderBinaryResult,
    type ProviderCapabilityRegistry,
} from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";

export function registerContentDeliveryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    dispatcher.register(
        "ulvia.cms.content",
        "delivery.resolve-path",
        async (input, context): Promise<ProviderBinaryResult> => {
            if (!context.actorKind || (context.actorKind !== "anonymous" && !context.subjectId)) {
                throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
            }
            let request: ReturnType<typeof parseResolvePathRequest>;
            try {
                request = parseResolvePathRequest(input);
            } catch {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            if (!dependencies.publicDelivery) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            const response = await dependencies
                .publicDelivery(context)
                .resolvePath(
                    request,
                    { kind: context.actorKind, ...(context.subjectId ? { subjectId: context.subjectId } : {}) },
                    dependencies.contentQuery
                        ? (contractId, capabilityId, value) =>
                              dependencies.contentQuery!(context, contractId, capabilityId, value)
                        : undefined,
                );
            const permitted = new Set([
                "content-type",
                "content-length",
                "content-language",
                "content-range",
                "accept-ranges",
                "content-disposition",
                "etag",
                "last-modified",
                "location",
                "cache-control",
                "retry-after",
                "x-robots-tag",
            ]);
            const resource = parseResourceMetadata({
                status: response.status,
                headers: Object.fromEntries([...response.headers].filter(([name]) => permitted.has(name))),
            });
            const empty = !response.body;
            return {
                kind: "binary",
                stream:
                    response.body ??
                    new ReadableStream({
                        start(controller) {
                            controller.close();
                        },
                    }),
                contentType: "application/octet-stream",
                ...(empty ? { contentLength: 0 } : {}),
                resource,
            };
        },
    );
}
