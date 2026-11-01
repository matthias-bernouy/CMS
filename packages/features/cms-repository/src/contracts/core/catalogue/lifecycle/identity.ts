import type { CapabilityDefinition } from "../../../interfaces/ContractRelease";
import type { ReleaseLimits } from "../../protocol/limits";
import { ReleaseValidationError } from "../../protocol/errors";
import { compareCapability } from "../../compatibility/capability/compare";
import { firstRemovedField } from "./fields";
import { firstChangedBinding } from "./bindings";

/** Direction follows SemVer, including when an older maintained line is published later. */
export function assertStableIdentity(
    before: CapabilityDefinition,
    after: CapabilityDefinition,
    limits: Readonly<ReleaseLimits>,
): void {
    const path = `$.capabilities[${JSON.stringify(before.id)}]`;
    const removed =
        firstRemovedField(before.input, after.input, `${path}.input`) ??
        firstRemovedField(before.output, after.output, `${path}.output`);
    const breaking = compareCapability(before, after, path, limits.maxJsonDepth).find(
        (change) => change.requiredBump === "major",
    );
    if (removed || breaking || firstChangedBinding(before, after)) {
        throw new ReleaseValidationError(
            "invalid_contract",
            `capability ${before.id} is stable; a major change requires a new capability and deprecation of the old one`,
            removed ?? breaking?.path ?? `${path}.bindings`,
        );
    }
}
