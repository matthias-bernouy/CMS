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

/**
 * Caches plaintext secrets for one execution only. Construct this resolver once
 * per ingress request and never retain it in a surface or runtime singleton.
 * References that normalize to one key must represent the same secret.
 */
export function createRequestScopedSecretResolver(
    resolve: SourceSecretResolver,
    normalizeReference: (reference: string) => string = (reference) => reference,
): SourceSecretResolver {
    const secrets = new Map<string, Promise<string | undefined>>();
    return async (reference) => {
        const normalizedReference = normalizeReference(reference);
        return memoizeRequestPromise(secrets, normalizedReference, () => resolve(normalizedReference));
    };
}
