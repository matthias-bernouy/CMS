import { compileHttpBinding, capabilityBindings, matchPathTemplate } from "@bernouy/cms-repository/contracts/bindings";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { GatewayTransportRequest } from "../../interfaces/Invocation";
import { GatewayError } from "../../core/GatewayError";
import type {
    GatewayHttpInvoker,
    GatewayHttpRouteRequest,
    GatewayHttpRoute,
    GatewayHttpTransportRequest,
} from "./interfaces";

export async function resolveGatewayHttpRoute(
    invoker: GatewayHttpInvoker,
    value: GatewayHttpRouteRequest,
): Promise<GatewayHttpRoute> {
    if (!invoker.resolveContract) {
        if (invoker.resolveHttp) {
            return invoker.resolveHttp(value);
        }
        throw new GatewayError("invalid_route", "HTTP contract resolver is unavailable");
    }
    const contract = await invoker.resolveContract(value);
    for (const candidate of contract.bindings) {
        const pathValues = matchPathTemplate(candidate.binding.path, value.path);
        const capability = contract.release.capabilities.find((item) => item.id === candidate.capabilityId);
        if (!pathValues || !capability) {
            continue;
        }
        if (
            candidate.binding.method === value.method ||
            (value.method === "HEAD" && candidate.binding.method === "GET" && capability.output.type === "binary")
        ) {
            return {
                capability,
                bindingId: candidate.bindingId,
                binding: value.method === "HEAD" ? headBinding(candidate.binding) : candidate.binding,
                pathValues,
            };
        }
    }
    throw new GatewayError("invalid_route", "selected release has no matching HTTP binding");
}

export function httpTransportRequest(request: GatewayTransportRequest): GatewayHttpTransportRequest {
    const bindings = capabilityBindings(request.capability).filter((binding) => binding.transport === "http");
    const definition = bindings.find((binding) => binding.id === request.bindingId) ?? bindings[0];
    if (!definition) {
        throw new GatewayError("unsupported_behavior", "selected capability has no outbound HTTP binding");
    }
    const binding = compileHttpBinding(request.capability, definition);
    if (request.metadataOnly && (binding.method !== "GET" || request.capability.output.type !== "binary")) {
        throw new GatewayError("unsupported_behavior", "HTTP metadata requests require a binary GET binding");
    }
    return { ...request, binding: request.metadataOnly ? headBinding(binding) : binding };
}

function headBinding(binding: CompiledHttpBinding): CompiledHttpBinding {
    return {
        ...binding,
        method: "HEAD",
        response: {
            ...binding.response,
            contentTypes: [],
            errorEnvelope: {
                kind: "headers",
                encoding: "json-percent",
                codeHeader: "x-ulvia-error-code",
                requestIdHeader: "x-ulvia-request-id",
            },
        },
    };
}

/** Logical HTTP entry points must also require an explicit HTTP exposure. */
export async function logicalHttpBinding(
    invoker: GatewayHttpInvoker,
    value: { siteId: string; contractId: string; capabilityId: string },
) {
    if (!invoker.resolveContract) {
        return {};
    }
    const contract = await invoker.resolveContract(value);
    const capability = contract.release.capabilities.find((item) => item.id === value.capabilityId);
    const binding = capability && capabilityBindings(capability).find((item) => item.transport === "http");
    if (!binding) {
        throw new GatewayError("invalid_route", "capability has no HTTP exposure");
    }
    return { bindingId: binding.id, bindingTransport: "http" };
}
