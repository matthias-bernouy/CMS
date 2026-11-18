import { compileOfficialFeatures, compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import { loadCompatibleImplementation } from "@bernouy/ulvia-sdk/provider";
import type { CompiledImplementations } from "@bernouy/ulvia-sdk";
import { capabilityKey, inventoryFromBuilds } from "../capabilities/inventory";

/** Re-admission uses the runtime's actual SDK loader, which retains the captured current handler factory. */
export async function compatibilityCatalogue(
    currentInput?: CompiledImplementations<unknown>,
    retainedInput?: readonly CompiledImplementations<unknown>[],
) {
    const current = currentInput ?? (await compileOfficialFeatures());
    const retained = retainedInput ?? (await compileRetainedFeatures());
    const checked: CompiledImplementations<unknown>[] = [];
    const seen = new Set<string>();
    for (const build of retained) {
        if (build.implementations.length !== 1) {
            throw new Error("Compatibility requires one exact retained claim per admission");
        }
        const claim = build.implementations[0]!;
        const key = JSON.stringify([claim.contractId, claim.version, claim.digest]);
        if (seen.has(key)) {
            throw new Error("Duplicate retained compatibility claim");
        }
        seen.add(key);
        const source = current.implementations.find((entry) => entry.contractId === claim.contractId);
        const admission = build.contracts.find(
            (entry) =>
                entry.digest === claim.digest &&
                entry.release.contractId === claim.contractId &&
                entry.release.version === claim.version,
        );
        if (!source || !admission) {
            throw new Error("Retained claim has no captured executor or admitted exact contract");
        }
        checked.push(await loadCompatibleImplementation(current, source, admission));
    }
    const performance = inventoryFromBuilds(current);
    const catalogue = inventoryFromBuilds(current, checked);
    const mappings = catalogue.targets
        .filter((target) => target.retained)
        .map((target) => {
            const source = current.implementations.find((entry) => entry.contractId === target.release.contractId)!;
            const representative = capabilityKey(source, target.definition.id);
            if (!performance.targets.some((entry) => entry.key === representative)) {
                throw new Error("Compatible capability has no independently tested executor representative");
            }
            return {
                target: target.key,
                release: target.release,
                sharedExecutor: representative,
                bindings: target.definition.bindings.map((binding) => binding.id),
                evidence: "sdk-compatible-loader" as const,
            };
        });
    return { performance, mappings, retainedClaims: checked.length };
}
