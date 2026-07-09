import type { FunctionUserContext } from "@bernouy/cms-functions";
import type { ExecutorDeps, SourceEndpoint, SourceRepository } from "@bernouy/cms-sources";
import type { FunctionRepository } from "@bernouy/cms-functions";
import { readJsonBodyUnderLimit, DEFAULT_TRIGGER_BODY_LIMIT_BYTES } from "./bodyBuffer";
import { matchingTriggers } from "./matchTrigger";
import { anyTriggerReadsRequestBody, anyTriggerReadsResponseBody } from "./triggerRefs";
import { runTriggers } from "./runTriggers";
import type { TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";

export type TriggerInterceptor = (
    endpoint: SourceEndpoint,
    request: Request,
    next: (req: Request) => Promise<Response>,
) => Promise<Response>;

export type CreateTriggerInterceptorOptions = {
    triggers: TriggerRepository;
    functions: FunctionRepository;
    sources: SourceRepository;
    deps?: ExecutorDeps;
    resolveUser?: (request: Request) => Promise<FunctionUserContext>;
    maxBodyBytes?: number;
};

export function createTriggerInterceptor(options: CreateTriggerInterceptorOptions): TriggerInterceptor {
    return async (endpoint, request, next) => {
        const installed = await options.triggers.getAllTriggers();
        const requestTriggers = matchingTriggers(installed, endpoint, "request");
        const responseTriggers = matchingTriggers(installed, endpoint, "response");
        if (!requestTriggers.length && !responseTriggers.length) return next(request);

        const userPromise = options.resolveUser
            ? options.resolveUser(request).catch(() => ({}))
            : Promise.resolve({});
        const requestBodyPromise = needsRequestBody(requestTriggers, responseTriggers)
            ? readJsonBodyUnderLimit(request.clone(), options.maxBodyBytes ?? DEFAULT_TRIGGER_BODY_LIMIT_BYTES)
            : Promise.resolve(undefined);

        const requestSync = syncTriggers(requestTriggers);
        if (requestSync.length) {
            const result = await runTriggers({
                ...runtimeOptions(options, endpoint, request),
                records: requestSync,
                phase: "request",
                user: await userPromise,
                requestBody: await requestBodyPromise,
            });
            if (result.blocked) return result.response!;
        }
        scheduleAsyncTriggers(requestTriggers, {
            ...runtimeOptions(options, endpoint, request),
            phase: "request",
            userPromise,
            requestBodyPromise,
        });

        const response = await next(request);
        if (!responseTriggers.length) return response;

        const responseBodyPromise = anyTriggerReadsResponseBody(responseTriggers)
            ? readJsonBodyUnderLimit(response.clone(), options.maxBodyBytes ?? DEFAULT_TRIGGER_BODY_LIMIT_BYTES)
            : Promise.resolve(undefined);
        const responseSync = syncTriggers(responseTriggers);
        if (responseSync.length) {
            const result = await runTriggers({
                ...runtimeOptions(options, endpoint, request),
                records: responseSync,
                phase: "response",
                responseStatus: response.status,
                responseBody: await responseBodyPromise,
                user: await userPromise,
                requestBody: await requestBodyPromise,
            });
            if (result.blocked) return result.response!;
        }
        scheduleAsyncTriggers(responseTriggers, {
            ...runtimeOptions(options, endpoint, request),
            phase: "response",
            responseStatus: response.status,
            userPromise,
            requestBodyPromise,
            responseBodyPromise,
        });

        return response;
    };
}

function runtimeOptions(options: CreateTriggerInterceptorOptions, endpoint: SourceEndpoint, request: Request) {
    return {
        triggers: options.triggers,
        functions: options.functions,
        sources: options.sources,
        deps: options.deps,
        endpoint,
        request,
    };
}

function needsRequestBody(requestTriggers: readonly TriggerRecord[], responseTriggers: readonly TriggerRecord[]): boolean {
    return anyTriggerReadsRequestBody(requestTriggers) || anyTriggerReadsRequestBody(responseTriggers);
}

function syncTriggers(triggers: readonly TriggerRecord[]): TriggerRecord[] {
    return triggers.filter(trigger => (trigger.mode ?? "async") === "sync");
}

function asyncTriggers(triggers: readonly TriggerRecord[]): TriggerRecord[] {
    return triggers.filter(trigger => (trigger.mode ?? "async") === "async");
}

function scheduleAsyncTriggers(
    triggers: readonly TriggerRecord[],
    options: ReturnType<typeof runtimeOptions> & {
        phase: "request" | "response";
        userPromise: Promise<FunctionUserContext>;
        requestBodyPromise: Promise<unknown | undefined>;
        responseStatus?: number;
        responseBodyPromise?: Promise<unknown | undefined>;
    },
): void {
    const records = asyncTriggers(triggers);
    if (!records.length) return;
    void (async () => {
        await runTriggers({
            triggers: options.triggers,
            records,
            functions: options.functions,
            sources: options.sources,
            deps: options.deps,
            endpoint: options.endpoint,
            request: options.request,
            phase: options.phase,
            responseStatus: options.responseStatus,
            user: await options.userPromise,
            requestBody: await options.requestBodyPromise,
            responseBody: options.responseBodyPromise ? await options.responseBodyPromise : undefined,
        });
    })().catch(() => undefined);
}
