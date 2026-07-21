import {
    makeEndpointUrn,
    makeSourceUrn,
    type EndpointParam,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { CmsFunction, FunctionEndpointInput } from "../interfaces/FunctionDefinition";

export const SYSTEM_FUNCTIONS_SOURCE_ID = "system-functions";
export const SYSTEM_FUNCTIONS_SOURCE_URN = makeSourceUrn(SYSTEM_FUNCTIONS_SOURCE_ID);
export const SYSTEM_FUNCTIONS_TARGET_SCHEME = "cms-system://functions/";

export function functionsAsSource(functions: readonly CmsFunction[], sourceId = SYSTEM_FUNCTIONS_SOURCE_ID): Source {
    return {
        urn: makeSourceUrn(sourceId),
        meta: {
            name: "Functions",
            description: "Declarative CMS functions projected as system source endpoints.",
        },
        endpoints: functions.map((fn) => functionAsEndpoint(fn, sourceId)),
    };
}

export function functionAsEndpoint(fn: CmsFunction, sourceId = SYSTEM_FUNCTIONS_SOURCE_ID): SourceEndpoint {
    return {
        urn: makeEndpointUrn(sourceId, fn.id),
        method: fn.method,
        targetUrl: `${SYSTEM_FUNCTIONS_TARGET_SCHEME}${encodeURIComponent(fn.id)}`,
        ...(fn.access ? { access: fn.access } : {}),
        ...(fn.meta ? { meta: fn.meta } : {}),
        ...(fn.input ? { input: endpointInput(fn.input) } : {}),
        ...(fn.output ? { output: fn.output } : {}),
    };
}

function endpointInput(input: FunctionEndpointInput): SourceEndpoint["input"] {
    return {
        ...(input.params
            ? {
                  params: Object.entries(input.params).map(
                      ([name, schema]) => ({ name, in: "query", schema }) satisfies EndpointParam,
                  ),
              }
            : {}),
        ...(input.body ? { body: input.body } : {}),
    };
}
