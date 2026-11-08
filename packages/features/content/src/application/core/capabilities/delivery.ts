import { parseResolvePathRequest } from "content/pages/delivery/resolvePathInput";
import type { ContentServices } from "content/application/interfaces/ContentServices";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import { ContentCapabilityError } from "./errors";
export async function resolveDelivery(
    input: Readonly<Record<string, unknown>>,
    context: ContentCapabilityContext,
    services: ContentServices,
) {
    if (!context.actorKind || (context.actorKind !== "anonymous" && !context.subjectId)) {
        throw new ContentCapabilityError("FORBIDDEN");
    }
    let request: ReturnType<typeof parseResolvePathRequest>;
    try {
        request = parseResolvePathRequest(input);
    } catch {
        throw new ContentCapabilityError("INVALID_INPUT");
    }
    if (!services.publicDelivery) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    const headers = new Headers(context.http?.headers);
    const response = await services
        .publicDelivery(context)
        .resolvePath(
            { path: request.path, method: request.method, query: request.query },
            { kind: context.actorKind, ...(context.subjectId ? { subjectId: context.subjectId } : {}) },
            services.contentQuery
                ? (contractId, capabilityId, value) => services.contentQuery!(context, contractId, capabilityId, value)
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
