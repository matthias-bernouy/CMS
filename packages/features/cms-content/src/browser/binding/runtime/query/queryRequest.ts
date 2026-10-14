import { parseQuery, parseQueryInput } from "cms-content/blocs/core/markup/bindings/source";
import { QUERY_ATTR, QUERY_INPUT_ATTR } from "../../core/attrs";
import { resolveSourceBodyFields } from "../../source/presentation/sourceBody";
import { setTypedPath } from "../../submit/typed/paths";
import type { SerializedFormData } from "../../submit/types";

export type QueryRequest = {
    url: string;
    init: RequestInit;
};

const KERNEL_QUERIES = new Map([["kernel.auth:methods", { url: "/.cms/auth/methods", method: "GET" }]]);

export function queryRequest(element: Element): QueryRequest {
    const binding = parseQuery(element.getAttribute(QUERY_ATTR) ?? "");
    if (!binding) {
        throw new TypeError("Invalid cms-query binding.");
    }

    const key = `${binding.contractId}:${binding.capabilityId}`;
    if (binding.contractId.startsWith("kernel.")) {
        const builtIn = KERNEL_QUERIES.get(key);
        if (!builtIn) {
            throw new TypeError(`Unknown Kernel query "${key}".`);
        }
        if (element.hasAttribute(QUERY_INPUT_ATTR)) {
            throw new TypeError(`Kernel query "${key}" does not accept cms-query-input.`);
        }
        return { url: builtIn.url, init: { method: builtIn.method } };
    }

    const input = element.getAttribute(QUERY_INPUT_ATTR);
    if (input !== null && !parseQueryInput(input)) {
        throw new TypeError("Invalid cms-query-input binding.");
    }
    if (input === null) {
        return {
            url: `/.cms/query/${binding.contractId}/${binding.capabilityId}`,
            init: { method: "GET" },
        };
    }
    const body = structuredQueryInput(input, element.ownerDocument);
    return {
        url: `/.cms/query/${binding.contractId}/${binding.capabilityId}`,
        init: {
            method: "QUERY",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
    };
}

function structuredQueryInput(input: string, document: Document): SerializedFormData {
    const fields = resolveSourceBodyFields(input, document, { omitMissingQueryParams: true }) ?? {};
    const body: SerializedFormData = {};
    const assigned = new Set<string>();
    for (const [name, value] of Object.entries(fields)) {
        setTypedPath(body, name, value, assigned);
    }
    return body;
}
