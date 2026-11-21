import { createHash } from "node:crypto";
import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import type { GatewayRoute } from "@bernouy/cms-gateway";
import type { AccountTemplateClient } from "@bernouy/auth/email-templates";
import { z } from "@bernouy/ulvia-sdk";
import { contentSchema, renderedSchema } from "@bernouy/email-templates/schemas";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderConnections } from "@bernouy/cms-gateway/provider/node";

type ComposedGateway = Awaited<ReturnType<typeof createProviderGateway>>;
type Gateway = {
    siteId: string;
    routes: Pick<ComposedGateway["routes"], "resolve">;
    invoker: Pick<ComposedGateway["invoker"], "invoke">;
};
const contractId = "ulvia/cms.email-templates";
/** Bound source account; all downstream calls use the ordinary admitted Gateway and live machine grants. */
export function accountTemplateClient(gateway: Gateway, connections: ProviderConnections, instanceId: string) {
    const route = async (contract: string) => {
        const value = await gateway.routes.resolve(gateway.siteId, contract);
        if (!value) {
            throw new Error("Required selected email service is unavailable");
        }
        return value;
    };
    const call = async (contract: string, capabilityId: string, input: unknown, source?: string) => {
        const selected = await route(contract);
        if (source && source !== sourceIdentity(selected)) {
            throw new Error("Selected Templates service changed; explicit reassociation required");
        }
        const access = await route("ulvia/cms.access");
        if (access.installation.installation.accountId !== instanceId) {
            throw new Error("Account composer does not own the selected Access installation");
        }
        const connection = await connections.get(access.selection.installationId);
        if (!connection) {
            throw new Error("Access return credential is unavailable");
        }
        const result = await gateway.invoker.invoke({
            siteId: gateway.siteId,
            contractId: contract,
            capabilityId,
            input,
            expectedTarget: target(selected),
            actor: {
                kind: "provider",
                installationId: access.selection.installationId,
                credentialFingerprint: providerCredentialFingerprint(connection.token),
            },
            ...(capabilityId === "emailer.send" ? { idempotencyKey: crypto.randomUUID() } : {}),
        });
        if (result.kind !== "success") {
            throw new Error("Selected email service refused the request");
        }
        return result.output;
    };
    const templates: AccountTemplateClient = {
        source: async () => sourceIdentity(await route(contractId)),
        describe: async (binding) => {
            const publication = z
                .object({ archived: z.boolean(), content: contentSchema })
                .parse(
                    await call(
                        contractId,
                        "templates.get-version",
                        { id: binding.id, version: binding.version },
                        binding.source,
                    ),
                );
            return publication;
        },
        render: async (binding, values) =>
            renderedSchema.parse(
                await call(
                    contractId,
                    "templates.render",
                    { id: binding.id, version: binding.version, values },
                    binding.source,
                ),
            ),
    };
    return { templates, call, source: templates.source };
}
function target(route: GatewayRoute) {
    const installed = route.installation.installation;
    return { installationId: installed.id, endpoint: installed.endpoint, accountId: installed.accountId };
}
function sourceIdentity(route: GatewayRoute) {
    return createHash("sha256")
        .update(JSON.stringify(target(route)))
        .digest("hex");
}
