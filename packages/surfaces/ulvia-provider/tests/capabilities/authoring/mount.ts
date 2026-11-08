import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { AuthoringService } from "@bernouy/cms-repository/features/authoring";
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
            providerId: "ulvia/primary-provider",
            scope: { siteId: "default", instanceId: "instance-a" },
        },
    );
}
