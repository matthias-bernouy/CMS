import { MongoClusterJournalReader } from "@bernouy/observability/mongo";
import { ClusterSourceError } from "@bernouy/observability/cluster";
import type { ClusterJournalDirectory } from "@bernouy/observability/cluster";
import type { ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { MongoClient } from "mongodb";
import { instanceDatabaseName } from "../../stores/storageRoots";

export function clusterJournalDirectory(
    mongo: Pick<MongoClient, "db">,
    instances: Pick<ProviderInstanceRegistry, "get">,
): ClusterJournalDirectory {
    return {
        open: async (id) => {
            const instance = await instances.get(id);
            if (!instance) {
                throw new ClusterSourceError("unavailable");
            }
            const release = instance.systemPlan?.contracts.find(
                ({ contractId }) => contractId === "ulvia/cms.observability",
            );
            if (
                !release ||
                release.version !== "1.0.0" ||
                release.digest !== "sha256:113758c81e4cdc774bba95c8f136a3a9650be5b6d59412ef51383bd15dd2de45"
            ) {
                throw new ClusterSourceError("unsupported");
            }
            return new MongoClusterJournalReader(mongo.db(instanceDatabaseName(instance.storageKey)), id);
        },
    };
}
