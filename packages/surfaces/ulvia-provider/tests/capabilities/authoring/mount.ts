import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createProviderOperationAdapter,
} from "@bernouy/ulvia-provider";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { AuthoringService } from "@bernouy/repository/features/authoring";
import type { ProviderCapabilityRegistry } from "@bernouy/ulvia-provider";
import { authoringServices } from "./services";
export async function mountAuthoringForTest(
    dispatcher: ProviderCapabilityRegistry,
    service: Partial<AuthoringService>,
) {
    const build = await loadOfficialFeatures();
    await registerOfficialFeatures(
        dispatcher,
        authoringServices(service),
        build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.authoring"),
        {
            operations: createProviderOperationAdapter(
                new ProviderOperationExecutor(new MemoryProviderOperationStore()),
            ),
            providerId: "ulvia/primary-provider",
            scope: { siteId: "default", instanceId: "instance-a" },
        },
    );
}
