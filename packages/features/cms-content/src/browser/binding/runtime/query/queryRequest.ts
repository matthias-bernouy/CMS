import { parseQuery, parseQueryInput } from "cms-content/blocs/core/markup/bindings/operation";
import { QUERY_ATTR, QUERY_INPUT_ATTR } from "../../core/attrs";
import { resolveBindingInput } from "../../state/bindingInput";
import { setStructuredPath, type StructuredData } from "../../state/structuredData";

export type QueryRequest =
    | {
          url: string;
          init: RequestInit;
          input?: StructuredData;
      }
    | { waiting: true };

export function queryRequest(element: Element): QueryRequest {
    const binding = parseQuery(element.getAttribute(QUERY_ATTR) ?? "");
    if (!binding) {
        throw new TypeError("Invalid cms-query binding.");
    }
    if (!("contractId" in binding)) {
        throw new TypeError("Synchronized-state queries do not use HTTP transport.");
    }

    if (binding.contractId.startsWith("kernel.")) {
        throw new TypeError("Kernel-owned queries are not part of the binding protocol.");
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
    if (!body) {
        return { waiting: true };
    }
    return {
        url: `/.cms/query/${binding.contractId}/${binding.capabilityId}`,
        init: {
            method: "QUERY",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
        input: body,
    };
}

function structuredQueryInput(input: string, document: Document): StructuredData | null {
    const resolved = resolveBindingInput(input, document);
    if (!resolved.ready) {
        return null;
    }
    const body: StructuredData = {};
    const assigned = new Set<string>();
    for (const [name, value] of Object.entries(resolved.fields)) {
        setStructuredPath(body, name, value, assigned);
    }
    return body;
}
