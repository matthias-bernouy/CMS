import { implementFeature } from "@bernouy/ulvia-sdk";
import { clusterLogsFeature } from "@bernouy/observability/cluster/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const clusterLogsImplementation = implementFeature(clusterLogsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.clusterLogs) {
            throw new TypeError("Cluster logs require an injected operator journal reader");
        }
        return { clusterLogs: dependencies.clusterLogs };
    },
});
