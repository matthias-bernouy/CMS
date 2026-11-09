import { HostingError } from "@bernouy/hosting";
import type { HostingActor } from "@bernouy/hosting";
import type { ProviderInstanceHost } from "../../composition/ProviderInstanceHost";

/** Called lazily: hosting ports are composed before Control initialization/recovery. */
export async function authorizeHostedCreation(host: ProviderInstanceHost, actor: HostingActor): Promise<boolean> {
    if (!host.hosting) {
        return false;
    }
    try {
        await host.hosting.authority.assertAdministrator(actor);
        return true;
    } catch (error) {
        if (error instanceof HostingError && error.code === "FORBIDDEN") {
            return false;
        }
        throw error;
    }
}
