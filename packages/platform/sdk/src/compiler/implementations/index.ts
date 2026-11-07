import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import type { CompiledImplementations, ContractImplementation } from "ulvia-sdk/interfaces/providers";
import { compileContracts } from "ulvia-sdk/compiler/contracts";
import { captureImplementations } from "ulvia-sdk/compiler/implementations/capture";
import { linkImplementations } from "ulvia-sdk/compiler/implementations/link";

/** Compile declarative sources at build time, then attach the captured executor identities. */
export async function compileImplementations<Dependencies>(
    sources: readonly ContractImplementation<Dependencies>[],
    dependencies: readonly FeatureDefinition[] = [],
): Promise<CompiledImplementations<Dependencies>> {
    const implementations = captureImplementations(sources);
    const contracts = await compileContracts([...implementations.map((source) => source.feature), ...dependencies]);
    return linkImplementations(implementations, contracts);
}
