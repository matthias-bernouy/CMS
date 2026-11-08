import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export interface RuntimeCapabilityPlan<Dependencies> {
    readonly contractId: string;
    readonly version: string;
    readonly requests: readonly Readonly<{ contractId: string; version: string; digest: string }>[];
    readonly defaultOperation: boolean;
    readonly capability: CapabilityDefinition;
    readonly source: CapabilitySource;
    readonly createHandler: (dependencies: Dependencies) => unknown;
}

const plans = new WeakMap<object, unknown>();

export function storeProviderPlan<Dependencies>(
    build: CompiledImplementations<Dependencies>,
    plan: readonly RuntimeCapabilityPlan<Dependencies>[],
): void {
    plans.set(build, Object.freeze([...plan]));
}

export function providerPlan<Dependencies>(
    build: CompiledImplementations<Dependencies>,
): readonly RuntimeCapabilityPlan<Dependencies>[] {
    const plan = plans.get(build);
    if (!plan) {
        throw new SdkDefinitionError("Provider runtime requires a build returned by compileProvider");
    }
    return plan as readonly RuntimeCapabilityPlan<Dependencies>[];
}
