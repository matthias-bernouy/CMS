import { parseUrn, type ExecutorDeps, type SourceEndpoint, type SourceRepository } from "@bernouy/cms-sources";
import { executeFunction, type FunctionUserContext } from "cms-functions/core/execution/executeFunction";
import { SYSTEM_FUNCTIONS_SOURCE_ID } from "cms-functions/core/repositories/projection";
import type { FunctionRepository } from "cms-functions/interfaces/FunctionRepository";

export type FunctionSystemExecutorOptions = {
    functions: FunctionRepository;
    sources: SourceRepository;
    deps?: ExecutorDeps;
    resolveUser?: (request: Request) => FunctionUserContext | Promise<FunctionUserContext>;
};

export async function executeFunctionSystemSourceEndpoint(
    endpoint: SourceEndpoint,
    request: Request,
    options: FunctionSystemExecutorOptions,
): Promise<Response> {
    const parsed = parseUrn(endpoint.urn);
    if (!parsed || parsed.source !== SYSTEM_FUNCTIONS_SOURCE_ID || !parsed.endpoint) {
        return new Response("Not Found", { status: 404 });
    }
    const fn = await options.functions.getFunction(parsed.endpoint);
    if (!fn) {
        return new Response("Not Found", { status: 404 });
    }
    return executeFunction(fn, request, {
        sources: options.sources,
        deps: options.deps,
        identities: options.deps?.identities,
        user: (await options.resolveUser?.(request)) ?? {},
    });
}
