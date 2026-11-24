import { implementFeature } from "@bernouy/ulvia-sdk";
import { accessFeature } from "@bernouy/auth/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const accessImplementation = implementFeature(accessFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        const {
            accountEmailTemplates,
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
            !accountEmailTemplates ||
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
            accountEmailTemplates,
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
        {
            contractId: "ulvia/cms.email-templates",
            versionRange: "^1.0.0",
            capabilityId: "templates.render",
            optional: false,
        },
        {
            contractId: "ulvia/cms.email-templates",
            versionRange: "^1.0.0",
            capabilityId: "templates.get-version",
            optional: false,
        },
        { contractId: "ulvia/cms.emailer", versionRange: "^1.0.0", capabilityId: "emailer.send", optional: false },
    ],
});
