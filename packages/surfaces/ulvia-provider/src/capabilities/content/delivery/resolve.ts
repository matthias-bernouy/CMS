import {
    parseResolvePathRequest,
    parseLegacyResolvePathRequest,
    legacyPublicPathRequest,
} from "@bernouy/cms-content/public-delivery";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { ProviderCapabilityInvocationContext } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";

export async function resolveDelivery(
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
    dependencies: CmsContentDependencies,
    legacy: boolean,
) {
    if (!context.actorKind || (context.actorKind !== "anonymous" && !context.subjectId)) {
        throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
    }
    let request: ReturnType<typeof parseLegacyResolvePathRequest>;
    try {
        request = legacy ? parseLegacyResolvePathRequest(input) : parseResolvePathRequest(input);
    } catch {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    if (!dependencies.publicDelivery) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    const headers = new Headers(context.headers);
    if (legacy) {
        for (const [name, value] of legacyPublicPathRequest(request, "https://legacy.invalid").headers) {
            headers.set(name, value);
        }
    }
    const response = await dependencies
        .publicDelivery(context)
        .resolvePath(
            { path: request.path, method: request.method, query: request.query },
            { kind: context.actorKind, ...(context.subjectId ? { subjectId: context.subjectId } : {}) },
            dependencies.contentQuery
                ? (contractId, capabilityId, value) =>
                      dependencies.contentQuery!(context, contractId, capabilityId, value)
                : undefined,
            { headers, signal: context.signal },
        );
    return { response, cacheMetadata: !legacy || request.resourceMetadata === "cache-v1" };
}
export function deliveryCacheTags(response: Response): readonly string[] {
    return [
        (response.headers.get("content-type") ?? "").startsWith("text/html")
            ? "content:pages"
            : (response.headers.get("cache-control") ?? "").includes("immutable")
              ? "content:immutable"
              : "content:mutable",
    ];
}
