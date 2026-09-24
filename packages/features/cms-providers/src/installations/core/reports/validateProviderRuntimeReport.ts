import type { AdmittedProviderManifest } from "cms-providers/manifests/core/admission/admitProviderManifest";
import { satisfiesVersionRange } from "cms-providers/manifests/core/versioning/versionRange";
import type { ProviderRuntimeReport } from "../../interfaces/ProviderRuntimeReport";
import { ProviderInstallationValidationError } from "../errors";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "../limits";
import { parseEndpoint } from "../parsing/fields";
import { parseProviderRuntimeReport } from "./parseProviderRuntimeReport";

/** Checks observations against an already admitted, CMS-approved manifest. */
export function validateProviderRuntimeReport(
    value: unknown,
    admission: AdmittedProviderManifest,
    expected: { readonly endpoint: string; readonly accountId?: string },
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderRuntimeReport {
    const report = parseProviderRuntimeReport(value, limits);
    const manifest = admission.manifest;
    if (report.providerId !== manifest.providerId) {
        throw new ProviderInstallationValidationError(
            "identity_mismatch",
            "must match the approved provider",
            "$.providerId",
        );
    }
    if (expected.accountId !== undefined && report.account.id !== expected.accountId) {
        throw new ProviderInstallationValidationError(
            "identity_mismatch",
            "must match the connected account",
            "$.account.id",
        );
    }
    if (report.manifest.version !== manifest.version || report.manifest.digest !== admission.digest) {
        throw new ProviderInstallationValidationError(
            "manifest_mismatch",
            "must match the approved manifest",
            "$.manifest",
        );
    }
    const endpoint = parseEndpoint(expected.endpoint, "$.endpoint");
    if (!manifest.endpoint.allowedOrigins.includes(endpoint)) {
        throw new ProviderInstallationValidationError(
            "manifest_mismatch",
            "origin is not allowed by the approved manifest",
            "$.endpoint",
        );
    }
    if (!satisfiesVersionRange(report.buildVersion, manifest.buildVersionRange)) {
        throw new ProviderInstallationValidationError(
            "manifest_mismatch",
            "build is not covered by the approved manifest",
            "$.buildVersion",
        );
    }
    const implementations = new Map(
        manifest.implementations.map((entry) => [`${entry.contractId}\u0000${entry.version}`, entry]),
    );
    for (const [index, entry] of report.implementations.entries()) {
        const claimed = implementations.get(`${entry.contractId}\u0000${entry.version}`);
        if (!claimed || claimed.digest !== entry.digest) {
            throw new ProviderInstallationValidationError(
                "manifest_mismatch",
                "implementation must match an exact approved release and digest",
                `$.implementations[${index}]`,
            );
        }
    }
    return report;
}
