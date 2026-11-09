import { verifyProviderInvocationToken, assertProviderInvocationSecret } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import {
    ROUTING_CONTRACT_ID,
    ROUTING_INSTANCE_ID,
    ROUTING_SITE_ID,
    EDGE_ROUTING_SERVICE,
} from "@bernouy/hosting/routing";
import type { RoutingAuthority } from "@bernouy/hosting/routing";
import type { SystemBootstrap } from "../execution/SystemBootstrap";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { UlviaProviderInstanceRuntime, UlviaProviderOptions } from "@bernouy/ulvia-provider";

/** A technical account mounts only the admitted machine contract; it is not a CMS instance. */
export async function createRoutingRuntime(system: SystemBootstrap, authority: RoutingAuthority, secret: string) {
    assertProviderInvocationSecret(secret);
    const plan = await system.routing();
    const contracts = await system.contracts(plan);
    if (contracts.length !== 1 || contracts[0]!.release.contractId !== ROUTING_CONTRACT_ID) {
        throw new Error("The exact admitted routing contract is unavailable");
    }
    const dispatcher = new DefaultProviderCapabilityDispatcher(contracts);
    await registerOfficialFeatures(dispatcher, { routing: authority }, plan.contracts, {
        providerId: plan.manifest.providerId,
        scope: { siteId: ROUTING_SITE_ID, instanceId: ROUTING_INSTANCE_ID },
    });
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: ROUTING_SITE_ID,
        contracts,
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: plan.manifest.providerId,
            instanceId: ROUTING_INSTANCE_ID,
            account: { id: ROUTING_INSTANCE_ID, label: "Hosting routing" },
            buildVersion: "1.0.0",
            manifest: { version: plan.manifest.version, digest: plan.manifest.digest as ProviderManifestDigest },
            implementations: contracts.map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
                status: "ready",
            })),
        },
        authorizeInvocation: async (claims) =>
            claims.instanceId === ROUTING_INSTANCE_ID &&
            claims.contractId === ROUTING_CONTRACT_ID &&
            claims.systemServiceId === EDGE_ROUTING_SERVICE &&
            !claims.subjectId &&
            !claims.sourceInstallationId &&
            !claims.connectionId,
    };
    const authenticate: UlviaProviderOptions["authenticateInvocationToken"] = async (token) => {
        try {
            const claims = verifyProviderInvocationToken(token, secret);
            if (!(await runtime.authorizeInvocation!(claims))) {
                return null;
            }
            return { claims, lease: { resource: runtime, release() {} } };
        } catch {
            return null;
        }
    };
    return { authenticate };
}
