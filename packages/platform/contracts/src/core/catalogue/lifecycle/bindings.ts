import type { CapabilityDefinition } from "../../../interfaces/ContractRelease";
import { compileHttpBinding } from "../../bindings/http/compile";
import { canonicalizeIJson } from "../../protocol/canonical";

/** Additive exposures are allowed; an existing route, codec or response contract stays executable. */
export function firstChangedBinding(previous: CapabilityDefinition, next: CapabilityDefinition): string | undefined {
    for (const binding of previous.bindings) {
        const replacement = next.bindings.find(({ id }) => id === binding.id);
        if (!replacement || binding.transport !== replacement.transport) {
            return binding.id;
        }
        if (binding.transport === "mcp" && replacement.transport === "mcp") {
            if (binding.tool?.name !== replacement.tool?.name) {
                return binding.id;
            }
        } else if (binding.transport === "http" && replacement.transport === "http") {
            const before = compileHttpBinding(previous, binding);
            const after = compileHttpBinding(next, replacement);
            if (
                before.method !== after.method ||
                before.path !== after.path ||
                !same(before.response, after.response)
            ) {
                return binding.id;
            }
            for (const parameters of ["pathParameters", "query", "headers"] as const) {
                if (
                    !before[parameters].every((parameter) =>
                        after[parameters].some((candidate) => same(parameter, candidate)),
                    )
                ) {
                    return binding.id;
                }
            }
            if (before.body?.kind === "json") {
                if (
                    after.body?.kind !== "json" ||
                    !before.body.properties.every(
                        (name) => after.body?.kind === "json" && after.body.properties.includes(name),
                    )
                ) {
                    return binding.id;
                }
            } else if (before.body && !same(before.body, after.body)) {
                return binding.id;
            }
        }
    }
    return undefined;
}
function same(left: unknown, right: unknown): boolean {
    return canonicalizeIJson(left) === canonicalizeIJson(right);
}
