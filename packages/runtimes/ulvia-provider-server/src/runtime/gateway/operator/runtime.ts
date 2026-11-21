import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import {
    CLUSTER_LOGS_CONTRACT_ID,
    CLUSTER_LOGS_SITE_ID,
    CLUSTER_LOGS_INSTANCE_ID,
    CLUSTER_OPERATOR_SERVICE,
} from "@bernouy/observability/cluster/feature";
import type { ClusterLogsServices } from "@bernouy/observability/cluster/feature";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { UlviaProviderInstanceRuntime } from "@bernouy/ulvia-provider";
import type { SystemBootstrap } from "../../instances/system/execution/SystemBootstrap";

export async function createClusterLogsRuntime(
    system: SystemBootstrap,
    clusterLogs: ClusterLogsServices["clusterLogs"],
): Promise<UlviaProviderInstanceRuntime> {
    const plan = await system.clusterLogs();
    const contracts = await system.contracts(plan);
    if (contracts.length !== 1 || contracts[0]!.release.contractId !== CLUSTER_LOGS_CONTRACT_ID) {
        throw new Error("The exact admitted operator logs contract is unavailable");
    }
    const dispatcher = new DefaultProviderCapabilityDispatcher(contracts);
    await registerOfficialFeatures(dispatcher, { clusterLogs }, plan.contracts, {
        providerId: plan.manifest.providerId,
        scope: { siteId: CLUSTER_LOGS_SITE_ID, instanceId: CLUSTER_LOGS_INSTANCE_ID },
    });
    return {
        siteId: CLUSTER_LOGS_SITE_ID,
        contracts,
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: plan.manifest.providerId,
            instanceId: CLUSTER_LOGS_INSTANCE_ID,
            account: { id: CLUSTER_LOGS_INSTANCE_ID, label: "Cluster operator" },
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
            claims.instanceId === CLUSTER_LOGS_INSTANCE_ID &&
            claims.contractId === CLUSTER_LOGS_CONTRACT_ID &&
            claims.systemServiceId === CLUSTER_OPERATOR_SERVICE &&
            !claims.subjectId &&
            !claims.sourceInstallationId &&
            !claims.connectionId,
    };
}
