import { implementFeature } from "@bernouy/ulvia-sdk";
import { emailTemplatesFeature } from "@bernouy/email-templates/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";
export const emailTemplatesImplementation = implementFeature(emailTemplatesFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.emailTemplates) {
            throw new TypeError("Email Templates requires an injected template service");
        }
        return { emailTemplates: dependencies.emailTemplates };
    },
});
