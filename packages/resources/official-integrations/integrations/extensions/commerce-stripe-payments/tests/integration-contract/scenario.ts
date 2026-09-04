import { assertArtifactContracts } from "./artifacts";
import { loadIntegrationContract } from "./harness";
import { assertRuntimeContracts } from "./runtime/index";

export async function runIntegrationContract(): Promise<void> {
    const context = await loadIntegrationContract();
    await assertArtifactContracts(context);
    await assertRuntimeContracts(context);
}
