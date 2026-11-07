import { implementFeature } from "@bernouy/ulvia-sdk";
import { smtpEmailerFeature } from "@bernouy/email-smtp/feature";

import type { UlviaProviderFeatureServices } from "../../../ports/index";

export const smtpEmailerImplementation = implementFeature(smtpEmailerFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.emailer) {
            throw new TypeError("SMTP Emailer requires an injected emailer service");
        }
        return { emailer: dependencies.emailer };
    },
    requires: ["secrets.create", "secrets.get-metadata-by-name", "secrets.resolve", "secrets.rotate"].map(
        (capabilityId) => ({
            contractId: "ulvia/cms.secrets",
            versionRange: "^1.0.0",
            capabilityId,
            optional: false,
        }),
    ),
});
