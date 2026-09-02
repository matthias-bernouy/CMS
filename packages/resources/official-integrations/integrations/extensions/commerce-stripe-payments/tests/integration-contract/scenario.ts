import { assertArtifactContracts } from "./artifacts";
import { assertBlocContracts } from "./bloc";
import { assertDashboardContracts } from "./dashboard";
import { loadIntegrationContract } from "./harness";
import { assertRuntimeContracts } from "./runtime/index";

export async function runIntegrationContract(): Promise<void> {
    const context = await loadIntegrationContract();
    await assertArtifactContracts(context);
    await assertDashboardContracts(context);
    await assertBlocContracts(context);
    await assertRuntimeContracts(context);
}
