import type { SourceComputedContext } from "../upstream/buildUpstreamUrl";
import type { SourceSecretResolver } from "./executeEndpoint";
import { memoizeRequestPromise, memoizeWeakRequestPromise } from "../repositories/requestScopeCache";

export type SourceContextResolver = (request: Request) => Promise<SourceComputedContext>;

export function createRequestScopedSourceContextResolver(resolve: SourceContextResolver): SourceContextResolver {
    const contexts = new WeakMap<Request, Promise<SourceComputedContext>>();
    return async (request) => {
        const context = await memoizeWeakRequestPromise(contexts, request, async () =>
            structuredClone(await resolve(request)),
        );
        return structuredClone(context);
    };
}

export function createRequestScopedSecretResolver(
    resolve: SourceSecretResolver,
    normalizeReference: (reference: string) => string = (reference) => reference,
): SourceSecretResolver {
    const secrets = new Map<string, Promise<string | undefined>>();
    return (reference) => memoizeRequestPromise(secrets, normalizeReference(reference), () => resolve(reference));
}
