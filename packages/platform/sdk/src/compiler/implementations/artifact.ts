import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ImplementationArtifact } from "ulvia-sdk/interfaces/artifacts";
import { parseImplementationArtifact } from "ulvia-sdk/provider/artifacts/parse";
import { providerPlan } from "ulvia-sdk/compiler/plan";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";

/** Emit contract metadata and exact claims only; docs/fixtures remain separately published assets. */
export function createImplementationArtifact<Dependencies>(
    build: CompiledImplementations<Dependencies>,
): ImplementationArtifact {
    providerPlan(build);
    return deepFreeze(
        parseImplementationArtifact({
            kind: "ulvia-sdk-runtime/v1" as const,
            contracts: build.contracts.map(({ canonicalJson, digest }) => ({ canonicalJson, digest })),
            implementations: structuredClone(build.implementations),
        }),
    );
}
