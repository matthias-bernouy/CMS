import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";

/** Test-only no-storage adapter; durable replay is covered in the runtime suite. */
export function smtpOptions(siteId = "site-a", instanceId = "instance-a"): ProviderRegistrationOptions {
    return {
        providerId: "ulvia/primary-provider",
        scope: { siteId, instanceId },
        executeKeyed: async (_invocation, execute) => execute(),
    };
}

export async function emailReleases() {
    return (await loadOfficialFeatures()).implementations.filter(
        ({ contractId }) => contractId === "ulvia/cms.emailer.smtp",
    );
}
