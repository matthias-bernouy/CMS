import { implementFeature } from "@bernouy/ulvia-sdk";
import { installationsFeature } from "@bernouy/repository/features/installations";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";
export const installationsImplementation = implementFeature(installationsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        const {
            initialization,
            collections,
            collectionUpgrades,
            gateway,
            management,
            sources,
            documentation,
            discovery,
            operations,
        } = dependencies;
        if (
            !initialization ||
            !collections ||
            !collectionUpgrades ||
            !gateway ||
            !gateway.contractUpgrades ||
            !management?.administration ||
            !documentation ||
            !discovery ||
            !operations
        ) {
            throw new TypeError(
                "Installations requires injected initialization, collections, upgrades, gateway, administration, discovery, documentation and operation queries",
            );
        }
        return {
            initialization,
            collections,
            collectionUpgrades,
            gateway,
            management,
            sources,
            documentation,
            discovery,
            operations,
        };
    },
    requires: [
        {
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId: "secrets.get-metadata-by-name",
            optional: false,
        },
        {
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId: "secrets.resolve",
            optional: false,
        },
        {
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId: "secrets.create",
            optional: false,
        },
        {
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId: "secrets.rotate",
            optional: false,
        },
        {
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId: "secrets.delete",
            optional: false,
        },
    ],
});
