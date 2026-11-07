import { parseResolvePathRequest } from "@bernouy/cms-content/public-delivery";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { ProviderCapabilityInvocationContext } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports/index";

export async function resolveDelivery(
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
    dependencies: CmsContentDependencies,
) {
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
    const headers = new Headers(context.http?.headers);
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
    return response;
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
