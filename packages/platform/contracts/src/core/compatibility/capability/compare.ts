import { capabilityBindings } from "../../bindings/definitions";
import { compileHttpBinding } from "../../bindings/http/compile";
import type { CapabilityDefinition } from "../../../interfaces/ContractRelease";
import { compareSchema, fingerprint } from "./schema";
import { compareErrors } from "./errors";
import { major, type CapabilityChange } from "./changes";

export function compareCapability(
    previous: CapabilityDefinition,
    next: CapabilityDefinition,
    path: string,
    maxJsonDepth: number,
): readonly CapabilityChange[] {
    const changes: CapabilityChange[] = [];
    if (previous.access !== next.access) {
        changes.push(major("capability_changed", `${path}.access`, "capability access changed"));
    }
    if (fingerprint(previous.behavior, maxJsonDepth) !== fingerprint(next.behavior, maxJsonDepth)) {
        changes.push(major("capability_changed", `${path}.behavior`, "capability behavior changed"));
    }
    if (
        fingerprint(previous.responseEffects ?? [], maxJsonDepth) !==
        fingerprint(next.responseEffects ?? [], maxJsonDepth)
    ) {
        changes.push(major("capability_changed", `${path}.responseEffects`, "capability response effects changed"));
    }
    const inputChange = compareSchema(previous.input, next.input, `${path}.input`, "input", maxJsonDepth);
    if (inputChange) {
        changes.push(inputChange);
    }
    const outputChange = compareSchema(previous.output, next.output, `${path}.output`, "output", maxJsonDepth);
    if (outputChange) {
        changes.push(outputChange);
    }
    changes.push(...compareErrors(previous.errors, next.errors, `${path}.errors`, maxJsonDepth));
    if (fingerprint(bindingPlans(previous), maxJsonDepth) !== fingerprint(bindingPlans(next), maxJsonDepth)) {
        changes.push({
            code: "binding_changed",
            path: `${path}.bindings`,
            message: "capability bindings changed",
            requiredBump: capabilityBindings(previous).some(
                (old) =>
                    old.transport === "mcp" &&
                    !capabilityBindings(next).some(
                        (item) => item.id === old.id && item.transport === "mcp" && item.tool?.name === old.tool?.name,
                    ),
            )
                ? "major"
                : "minor",
        });
    }
    return changes;
}

function bindingPlans(capability: CapabilityDefinition): unknown {
    return capabilityBindings(capability).map((binding) =>
        binding.transport === "http"
            ? { id: binding.id, transport: binding.transport, binding: compileHttpBinding(capability, binding) }
            : {
                  id: binding.id,
                  transport: binding.transport,
                  ...(binding.tool?.name ? { name: binding.tool.name } : {}),
              },
    );
}
