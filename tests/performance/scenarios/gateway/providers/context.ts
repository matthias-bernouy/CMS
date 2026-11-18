import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { readProviderCredential } from "../../../../integration/instance/providers/credentials";
import { providerContext, INSTALLATIONS } from "../../providers/context";
import { gatewayContext, gatewayRoute, assertGatewayScope } from "../context";
import { settingsCredentialKey } from "./scope";
import { assertCondition, requireRecord } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { settingsTenants } from "../../content/settings/tenant";
import type { ProviderPeer } from "../../providers/peer";

export async function gatewayProviderContext(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    peer: ProviderPeer,
) {
    const provider = await providerContext(environment, lease, peer, "http");
    try {
        const source = await provider.ensure();
        const key = settingsCredentialKey(environment.stack, provider.state.site, environment.main.origin);
        const owned = await readProviderCredential(
            environment.stack.providerName,
            key,
            undefined,
            provider.state.site.instanceId,
        );
        assertCondition(typeof owned.controlToken === "string" && owned.controlToken.length >= 32);
        const gateway = await gatewayContext(inventory, {
            ...environment,
            main: provider.state.session,
            stack: {
                ...environment.stack,
                instanceId: provider.state.site.instanceId,
                providerControl: { origin: environment.stack.providerControl!.origin, token: owned.controlToken },
            },
        });
        const route = gatewayRoute(
            await gateway.checked("gateway.route.get", { contractId: "ulvia/cms.observability" }),
        );
        assertGatewayScope(route, provider.state.site.instanceId);
        const selection = requireRecord(route.selection);
        const logs = inventory.targets.find(
            (row) =>
                !row.retained &&
                row.release.contractId === "ulvia/cms.observability" &&
                row.definition.id === "logs.append",
        );
        assertCondition(logs && selection.digest === logs.release.digest && selection.version === logs.release.version);
        const credential = await provider.credential(String(source.id));
        assertCondition(typeof credential.token === "string" && credential.token.length >= 32);
        const target = {
            sourceInstallationId: source.id,
            targetInstallationId: selection.installationId,
            contractId: "ulvia/cms.observability",
            capabilityId: "logs.append",
            version: selection.version,
            sourceCredentialFingerprint: providerCredentialFingerprint(credential.token),
        };
        const rotate = async () => {
            const current = await provider.checked("get-provider-access", { installationId: source.id });
            await provider.checked("pair-provider-connection", {
                installationId: source.id,
                expectedRevision: current.revision,
                rotate: true,
            });
            const fresh = await provider.credential(String(source.id));
            assertCondition(fresh.token !== credential.token);
            return fresh.token;
        };
        const originalGateway = await gatewayContext(inventory, environment);
        return {
            provider,
            gateway,
            originalGateway,
            source,
            selection,
            credential,
            target,
            rotate,
            contract: INSTALLATIONS,
            credentialKey: key,
            close: provider.close,
        };
    } catch (error) {
        await provider.close();
        throw error;
    }
}

export type GatewayProviderContext = Awaited<ReturnType<typeof gatewayProviderContext>>;
