import type { DeclarativeConnectorFunctionHttpContract } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareResponseShape } from "./shapes";

export function compareHttpContract(
    baseline: DeclarativeConnectorFunctionHttpContract,
    candidate: DeclarativeConnectorFunctionHttpContract,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareRequiredSet(baseline.requiredSecrets, candidate.requiredSecrets, `${path}.requiredSecrets`, "secret", add);
    const previous = new Map(baseline.endpoints.map((endpoint) => [endpointIdentity(endpoint), endpoint]));
    const next = new Map(candidate.endpoints.map((endpoint) => [endpointIdentity(endpoint), endpoint]));
    for (const [identity, endpoint] of previous) {
        const candidateEndpoint = next.get(identity);
        const endpointPath = `${path}.endpoints.${identity}`;
        if (!candidateEndpoint) {
            add("breaking", "function", "endpoint-removed", endpointPath, "HTTP endpoint was removed or renamed");
            continue;
        }
        compareRequiredSet(
            endpoint.requiredInputs,
            candidateEndpoint.requiredInputs,
            `${endpointPath}.inputs`,
            "input",
            add,
        );
        compareRequiredSet(
            endpoint.requiredHeaders,
            candidateEndpoint.requiredHeaders,
            `${endpointPath}.headers`,
            "header",
            add,
        );
        compareResponses(endpoint.responses, candidateEndpoint.responses, `${endpointPath}.responses`, add);
    }
    for (const [identity] of next) {
        if (!previous.has(identity)) {
            add("additive", "function", "endpoint-added", `${path}.endpoints.${identity}`, "HTTP endpoint was added");
        }
    }
}

function compareResponses(
    baseline: DeclarativeConnectorFunctionHttpContract["endpoints"][number]["responses"],
    candidate: DeclarativeConnectorFunctionHttpContract["endpoints"][number]["responses"],
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map(baseline.map((response) => [response.status, response]));
    const next = new Map(candidate.map((response) => [response.status, response]));
    for (const [status, response] of previous) {
        const candidateResponse = next.get(status);
        if (!candidateResponse) {
            add(
                "breaking",
                "function",
                "response-status-removed",
                `${path}.${status}`,
                "Declared response status was removed",
            );
        } else {
            compareResponseShape(response.body, candidateResponse.body, `${path}.${status}.body`, add);
        }
    }
    for (const [status] of next) {
        if (!previous.has(status)) {
            add(
                "additive",
                "function",
                "response-status-added",
                `${path}.${status}`,
                "Declared response status was added",
            );
        }
    }
}

function compareRequiredSet(
    baseline: readonly string[],
    candidate: readonly string[],
    path: string,
    label: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Set(baseline);
    const next = new Set(candidate);
    for (const value of previous) {
        if (!next.has(value)) {
            add(
                "additive",
                "function",
                `required-${label}-removed`,
                `${path}.${value}`,
                `Required ${label} became optional`,
            );
        }
    }
    for (const value of next) {
        if (!previous.has(value)) {
            add(
                "breaking",
                "function",
                `required-${label}-added`,
                `${path}.${value}`,
                `New required ${label} was added`,
            );
        }
    }
}

function endpointIdentity(endpoint: DeclarativeConnectorFunctionHttpContract["endpoints"][number]): string {
    return `${endpoint.method} ${endpoint.route}`;
}
