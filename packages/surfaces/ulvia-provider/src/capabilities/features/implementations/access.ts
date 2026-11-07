import { implementFeature } from "@bernouy/ulvia-sdk";
import { accessFeature } from "@bernouy/cms-auth/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";

export const accessImplementation = implementFeature(accessFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        const {
            users,
            credentials,
            pats,
            authentication,
            accountLifecycle,
            mcpAuthorization,
            governance,
            withUserDeletion,
        } = dependencies;
        if (
            !users ||
            !credentials ||
            !pats ||
            !authentication ||
            !accountLifecycle ||
            !mcpAuthorization ||
            !governance
        ) {
            throw new TypeError("Access requires injected account, authentication, MCP and governance services");
        }
        return {
            users,
            credentials,
            pats,
            authentication,
            accountLifecycle,
            mcpAuthorization,
            governance,
            withUserDeletion,
        };
    },
    requires: [
        { contractId: "ulvia/cms.emailer", versionRange: "^1.0.0", capabilityId: "emailer.send", optional: false },
    ],
});
