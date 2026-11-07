import { verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ContractImplementation, CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import { captureImplementations } from "ulvia-sdk/compiler/implementations/capture";
import { linkImplementations } from "ulvia-sdk/compiler/implementations/link";
import { parseImplementationArtifact } from "ulvia-sdk/provider/artifacts/parse";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Attach matching code to trusted build output without compiling Zod schemas or reading authored assets. */
export async function loadImplementations<Dependencies>(
    sources: readonly ContractImplementation<Dependencies>[],
    value: unknown,
): Promise<CompiledImplementations<Dependencies>> {
    const captured = captureImplementations(sources);
    const artifact = parseImplementationArtifact(value);
    const contracts = [];
    const coordinates = new Set<string>();
    for (const { canonicalJson, digest } of artifact.contracts) {
        const contract = await verifyStoredContractReleaseJson(canonicalJson, digest);
        const key = `${contract.release.contractId}@${contract.release.version}`;
        if (coordinates.has(key) || contract.canonicalJson !== canonicalJson) {
            throw new SdkDefinitionError("Duplicate or noncanonical runtime contract");
        }
        coordinates.add(key);
        contracts.push(contract);
    }
    const build = await linkImplementations(captured, Object.freeze(contracts));
    if (canonicalizeIJson(build.implementations) !== canonicalizeIJson(artifact.implementations)) {
        throw new SdkDefinitionError("Implementation claims differ from the trusted build artifact");
    }
    return build;
}
