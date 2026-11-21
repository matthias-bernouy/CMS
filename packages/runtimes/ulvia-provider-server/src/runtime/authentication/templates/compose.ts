import { selectedAccountEmailer } from "./delivery";
import { AccountEmailTemplates } from "@bernouy/auth/email-templates";
import type { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";
import { accountTemplateClient } from "./client";
import { initializeAccountTemplates } from "./initialize";

export function composeAccountTemplates(
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    connections: ProviderConnections,
    instanceId: string,
) {
    const client = accountTemplateClient(gateway, connections, instanceId);
    const accountEmailTemplates = new AccountEmailTemplates(stores.accountEmailConfiguration, client.templates);
    return {
        accountEmailTemplates,
        emailer: selectedAccountEmailer(client.call, async () => {
            const route = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.emailer");
            if (!route) {
                throw new Error("Selected Emailer is unavailable");
            }
            const access = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.access");
            return route.selection.installationId === access?.selection.installationId
                ? stores.emailer.isEnabled()
                : true;
        }),
        initialize: async (checkpoint: () => void) => {
            if (await stores.accountEmailConfiguration.read()) {
                return;
            }
            const selected = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.email-templates");
            const access = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.access");
            if (!selected || selected.selection.installationId !== access?.selection.installationId) {
                throw new Error("Default account templates require the official instance Templates selection");
            }
            await initializeAccountTemplates(
                stores.accountEmailConfiguration,
                stores.emailTemplates,
                await client.source(),
                checkpoint,
            );
        },
    };
}
