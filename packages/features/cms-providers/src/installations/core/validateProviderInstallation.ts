import { SchemaValueError, validateSchemaValue } from "@bernouy/cms-contracts/schema";
import type { AdmittedProviderManifest } from "cms-providers/manifests/core/admission/admitProviderManifest";
import type { ProviderInstallation } from "cms-providers/installations/interfaces/ProviderInstallation";
import { ProviderInstallationValidationError } from "./errors";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "./limits";
import { parseProviderInstallation } from "./parsing/parseProviderInstallation";

/** Consumes a trusted admitted manifest. Validation neither records approval nor establishes a connection. */
export function validateProviderInstallation(
    value: unknown,
    admission: AdmittedProviderManifest,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderInstallation {
    const installation = parseProviderInstallation(value, limits);
    if (installation.providerId !== admission.manifest.providerId) {
        throw new ProviderInstallationValidationError(
            "identity_mismatch",
            "provider identity differs from manifest",
            "$.providerId",
        );
    }
    if (
        installation.approval.manifestDigest !== admission.digest ||
        installation.approval.manifestVersion !== admission.manifest.version
    ) {
        throw new ProviderInstallationValidationError(
            "manifest_mismatch",
            "approval must pin the exact admitted manifest",
            "$.approval",
        );
    }
    if (!admission.manifest.endpoint.allowedOrigins.includes(installation.endpoint)) {
        throw new ProviderInstallationValidationError(
            "manifest_mismatch",
            "endpoint is not approved by manifest",
            "$.endpoint",
        );
    }
    try {
        validateSchemaValue(admission.manifest.configuration, installation.configuration);
    } catch (error) {
        if (error instanceof SchemaValueError) {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "configuration does not satisfy the manifest schema",
                "$.configuration",
            );
        }
        throw error;
    }
    return installation;
}
