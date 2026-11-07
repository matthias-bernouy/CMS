import type { ReleaseDigest } from "@bernouy/ulvia-contracts";
import type { ProviderManifestDigest } from "ulvia-providers/manifests/core/admission/admitProviderManifest";
import { parseResourceIdentifier } from "ulvia-providers/manifests/core/parsing/identifiers";
import {
    compareOrdinal,
    expectArray,
    expectRecord,
    expectString,
    rejectUnknownKeys,
    unique,
} from "ulvia-providers/manifests/core/protocol/values";
import { parseSemVer } from "ulvia-providers/manifests/core/versioning/versionRange";
import type {
    ProviderRuntimeImplementation,
    ProviderRuntimeReport,
} from "ulvia-providers/installations/interfaces/ProviderRuntimeReport";
import { ProviderInstallationValidationError } from "../errors";
import {
    DEFAULT_PROVIDER_INSTALLATION_LIMITS,
    type ProviderInstallationLimits,
} from "ulvia-providers/installations/core/limits";
import { parseInstallationDocument, parseInstallationJson } from "../parsing/documents";
import { parseDigest, parseOpaqueId } from "../parsing/fields";

export function parseProviderRuntimeReport(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderRuntimeReport {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(
            record,
            ["protocol", "providerId", "instanceId", "account", "buildVersion", "manifest", "implementations"],
            "$",
        );
        if (record.protocol !== "ulvia-provider/v1") {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "must be ulvia-provider/v1",
                "$.protocol",
            );
        }
        const account = expectRecord(record.account, "$.account");
        rejectUnknownKeys(account, ["id", "label"], "$.account");
        const manifest = expectRecord(record.manifest, "$.manifest");
        rejectUnknownKeys(manifest, ["version", "digest"], "$.manifest");
        const implementations = expectArray(record.implementations, "$.implementations", limits.maxImplementations).map(
            (implementation, index) => parseImplementation(implementation, `$.implementations[${index}]`),
        );
        unique(
            implementations.map((entry) => `${entry.contractId}\u0000${entry.version}`),
            "$.implementations",
        );
        return {
            protocol: "ulvia-provider/v1",
            providerId: parseResourceIdentifier(record.providerId, "$.providerId"),
            instanceId: parseOpaqueId(record.instanceId, "$.instanceId"),
            account: {
                id: parseOpaqueId(account.id, "$.account.id"),
                label: expectString(account.label, "$.account.label", 128),
            },
            buildVersion: parseSemVer(record.buildVersion, "$.buildVersion"),
            manifest: {
                version: parseSemVer(manifest.version, "$.manifest.version"),
                digest: parseDigest(manifest.digest, "$.manifest.digest") as ProviderManifestDigest,
            },
            implementations: implementations.sort(
                (left, right) =>
                    compareOrdinal(left.contractId, right.contractId) || compareOrdinal(left.version, right.version),
            ),
        };
    });
}

export function parseProviderRuntimeReportJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderRuntimeReport {
    return parseInstallationJson(input, limits, (value) => parseProviderRuntimeReport(value, limits));
}

function parseImplementation(value: unknown, path: string): ProviderRuntimeImplementation {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["contractId", "version", "digest", "status"], path);
    const status = record.status;
    if (status !== "ready" && status !== "setup-required" && status !== "unavailable") {
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "must be ready, setup-required, or unavailable",
            `${path}.status`,
        );
    }
    return {
        contractId: parseResourceIdentifier(record.contractId, `${path}.contractId`),
        version: parseSemVer(record.version, `${path}.version`),
        digest: parseDigest(record.digest, `${path}.digest`) as ReleaseDigest,
        status,
    };
}
