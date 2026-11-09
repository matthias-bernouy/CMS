import { implementFeature } from "@bernouy/ulvia-sdk";
import { hostingTlsFeature } from "@bernouy/hosting/tls";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const hostingTlsImplementation = implementFeature(hostingTlsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.hostingTls) {
            throw new TypeError("TLS permission requires an injected host authority");
        }
        return { hostingTls: dependencies.hostingTls };
    },
});
