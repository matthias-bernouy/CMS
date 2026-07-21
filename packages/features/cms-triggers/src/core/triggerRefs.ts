import { collectReferences, valueAt, type FunctionUserContext } from "@bernouy/cms-functions";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import { endpointMatch } from "./matchTrigger";
import type { TriggerRecord } from "../interfaces/TriggerDefinition";

export type TriggerRuntimeVars = {
    request: {
        method: string;
        params: Record<string, unknown>;
        body?: unknown;
    };
    response?: {
        status: number;
        body?: unknown;
    };
    endpoint: {
        urn: string;
        source: string;
        endpoint: string;
    };
    ctx?: {
        user?: FunctionUserContext;
    };
};

export function triggerVars(input: {
    endpoint: SourceEndpoint;
    request: Request;
    requestBody?: unknown;
    responseStatus?: number;
    responseBody?: unknown;
    user?: FunctionUserContext;
}): TriggerRuntimeVars {
    const match = endpointMatch(input.endpoint) ?? { source: "", endpoint: "" };
    return {
        request: {
            method: input.request.method,
            params: requestParams(input.request),
            ...(input.requestBody !== undefined ? { body: input.requestBody } : {}),
        },
        ...(input.responseStatus !== undefined
            ? {
                  response: {
                      status: input.responseStatus,
                      ...(input.responseBody !== undefined ? { body: input.responseBody } : {}),
                  },
              }
            : {}),
        endpoint: {
            urn: input.endpoint.urn,
            source: match.source,
            endpoint: match.endpoint,
        },
        ctx: { user: input.user ?? {} },
    };
}

export function resolveTriggerReference(ref: string, vars: TriggerRuntimeVars): unknown {
    if (ref === "$request") {
        return vars.request;
    }
    if (ref === "$request.method") {
        return vars.request.method;
    }
    if (ref === "$request.params") {
        return vars.request.params;
    }
    if (ref.startsWith("$request.params.")) {
        return valueAt(vars.request.params, ref.slice("$request.params.".length));
    }
    if (ref === "$request.body") {
        return vars.request.body;
    }
    if (ref.startsWith("$request.body.")) {
        return valueAt(vars.request.body, ref.slice("$request.body.".length));
    }
    if (ref === "$response") {
        return vars.response;
    }
    if (ref === "$response.status") {
        return vars.response?.status;
    }
    if (ref === "$response.body") {
        return vars.response?.body;
    }
    if (ref.startsWith("$response.body.")) {
        return valueAt(vars.response?.body, ref.slice("$response.body.".length));
    }
    if (ref === "$endpoint") {
        return vars.endpoint;
    }
    if (ref === "$endpoint.urn") {
        return vars.endpoint.urn;
    }
    if (ref === "$endpoint.source") {
        return vars.endpoint.source;
    }
    if (ref === "$endpoint.endpoint") {
        return vars.endpoint.endpoint;
    }
    if (ref === "$ctx") {
        return vars.ctx;
    }
    if (ref === "$ctx.user") {
        return vars.ctx?.user;
    }
    if (ref.startsWith("$ctx.user.")) {
        return valueAt(vars.ctx?.user, ref.slice("$ctx.user.".length));
    }
    return undefined;
}

export function triggerReadsRequestBody(trigger: TriggerRecord): boolean {
    return triggerReferences(trigger).some(isRequestBodyRef);
}

export function triggerReadsResponseBody(trigger: TriggerRecord): boolean {
    return triggerReferences(trigger).some(isResponseBodyRef);
}

export function anyTriggerReadsRequestBody(triggers: readonly TriggerRecord[]): boolean {
    return triggers.some(triggerReadsRequestBody);
}

export function anyTriggerReadsResponseBody(triggers: readonly TriggerRecord[]): boolean {
    return triggers.some(triggerReadsResponseBody);
}

export function triggerReferences(trigger: TriggerRecord): string[] {
    return [
        ...collectReferences(trigger.condition),
        ...collectReferences(trigger.function.params),
        ...collectReferences(trigger.function.body),
    ];
}

function isRequestBodyRef(ref: string): boolean {
    return ref === "$request.body" || ref.startsWith("$request.body.");
}

function isResponseBodyRef(ref: string): boolean {
    return ref === "$response.body" || ref.startsWith("$response.body.");
}

function requestParams(request: Request): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const [key, value] of new URL(request.url).searchParams) {
        const previous = params[key];
        if (previous === undefined) {
            params[key] = value;
        } else if (Array.isArray(previous)) {
            previous.push(value);
        } else {
            params[key] = [previous, value];
        }
    }
    return params;
}
