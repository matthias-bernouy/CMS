import type {
    ProviderInstallation,
    ProviderManifestApproval,
} from "cms-providers/installations/interfaces/ProviderInstallation";
import type { ProviderManifestDigest } from "cms-providers/manifests/core/admission/admitProviderManifest";
import { parseIdentifier, parseDateTime } from "cms-providers/manifests/core/parsing/identifiers";
import { parseSemVer } from "cms-providers/manifests/core/versioning/versionRange";
import { expectRecord, expectString, rejectUnknownKeys } from "cms-providers/manifests/core/values";
import { ProviderInstallationValidationError } from "../errors";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "../limits";
import { parseInstallationDocument, parseInstallationJson } from "./documents";
import { parseDigest, parseEndpoint, parseOpaqueId, parseSecretRef } from "./fields";

export function parseProviderInstallation(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderInstallation {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(
            record,
            [
                "id",
                "siteId",
                "providerId",
                "accountId",
                "endpoint",
                "status",
                "approval",
                "providerTokenRef",
                "gatewayTokenRef",
                "configuration",
                "createdAt",
                "updatedAt",
            ],
            "$",
        );
        const status = expectString(record.status, "$.status", 16);
        if (status !== "enabled" && status !== "disabled" && status !== "revoked") {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "invalid administrative status",
                "$.status",
            );
        }
        const approval = parseApproval(record.approval);
        const createdAt = parseDateTime(record.createdAt, "$.createdAt");
        const updatedAt = parseDateTime(record.updatedAt, "$.updatedAt");
        if (
            Date.parse(createdAt) > Date.parse(approval.approvedAt) ||
            Date.parse(approval.approvedAt) > Date.parse(updatedAt)
        ) {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "must satisfy createdAt <= approvedAt <= updatedAt",
            );
        }
        const providerTokenRef = parseSecretRef(record.providerTokenRef, "$.providerTokenRef");
        const gatewayTokenRef =
            record.gatewayTokenRef === undefined
                ? undefined
                : parseSecretRef(record.gatewayTokenRef, "$.gatewayTokenRef");
        if (gatewayTokenRef === providerTokenRef) {
            throw new ProviderInstallationValidationError(
                "invalid_installation",
                "credential directions require distinct references",
                "$.gatewayTokenRef",
            );
        }
        return {
            id: parseOpaqueId(record.id, "$.id"),
            siteId: parseOpaqueId(record.siteId, "$.siteId"),
            providerId: parseIdentifier(record.providerId, "$.providerId", 96),
            accountId: parseOpaqueId(record.accountId, "$.accountId"),
            endpoint: parseEndpoint(record.endpoint, "$.endpoint"),
            status,
            approval,
            providerTokenRef,
            ...(gatewayTokenRef === undefined ? {} : { gatewayTokenRef }),
            configuration: expectRecord(record.configuration, "$.configuration"),
            createdAt,
            updatedAt,
        };
    });
}

export function parseProviderInstallationJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderInstallation {
    return parseInstallationJson(input, limits, (value) => parseProviderInstallation(value, limits));
}

function parseApproval(value: unknown): ProviderManifestApproval {
    const record = expectRecord(value, "$.approval");
    rejectUnknownKeys(record, ["manifestVersion", "manifestDigest", "approvedAt", "approvedBy"], "$.approval");
    return {
        manifestVersion: parseSemVer(record.manifestVersion, "$.approval.manifestVersion"),
        manifestDigest: parseDigest(record.manifestDigest, "$.approval.manifestDigest") as ProviderManifestDigest,
        approvedAt: parseDateTime(record.approvedAt, "$.approval.approvedAt"),
        approvedBy: parseOpaqueId(record.approvedBy, "$.approval.approvedBy"),
    };
}
