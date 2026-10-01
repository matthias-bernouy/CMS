import { ProviderManifestValidationError } from "../errors";
import {
    compareOrdinal,
    expectArray,
    expectBoolean,
    expectRecord,
    expectString,
    rejectUnknownKeys,
    unique,
} from "../values";
import type {
    ProviderCredentialSlot,
    ProviderCredentialSecretType,
    ProviderDataPolicy,
    ProviderManifestLinks,
    ProviderManifestProvenance,
    ProviderRecoveryPolicy,
} from "../../interfaces/ProviderManifest";
import { parseVersionRange } from "../versioning/versionRange";
import { parseDateTime, parseIdentifier } from "./identifiers";

export function parseProvenance(value: unknown, path: string): ProviderManifestProvenance {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["publisherId", "publishedAt"], path);
    return {
        publisherId: parseIdentifier(record.publisherId, `${path}.publisherId`, 96),
        publishedAt: parseDateTime(record.publishedAt, `${path}.publishedAt`),
    };
}

export function parseManifestLinks(value: unknown, path: string): ProviderManifestLinks | undefined {
    if (value === undefined) {
        return undefined;
    }
    const record = expectRecord(value, path);
    const keys = ["website", "setup", "documentation", "support"] as const;
    rejectUnknownKeys(record, keys, path);
    const links = Object.fromEntries(
        keys
            .filter((key) => record[key] !== undefined)
            .map((key) => [key, parsePublicUrl(record[key], `${path}.${key}`)]),
    ) as ProviderManifestLinks;
    if (Object.keys(links).length === 0) {
        throw new ProviderManifestValidationError("invalid_manifest", "must contain at least one link", path);
    }
    return links;
}

export function parseCredentialSlots(value: unknown, path: string, maximum: number): ProviderCredentialSlot[] {
    const slots = expectArray(value, path, maximum).map((slot, index) => {
        const slotPath = `${path}[${index}]`;
        const record = expectRecord(slot, slotPath);
        rejectUnknownKeys(record, ["id", "label", "required", "secretType"], slotPath);
        const secretType = expectString(record.secretType, `${slotPath}.secretType`, 32);
        if (secretType !== "password" && secretType !== "private-key" && secretType !== "token") {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "must be password, private-key, or token",
                `${slotPath}.secretType`,
            );
        }
        return {
            id: parseIdentifier(record.id, `${slotPath}.id`, 64),
            label: expectString(record.label, `${slotPath}.label`, 128),
            required: expectBoolean(record.required, `${slotPath}.required`),
            secretType: secretType as ProviderCredentialSecretType,
        };
    });
    unique(
        slots.map((slot) => slot.id),
        path,
    );
    return slots.sort((left, right) => compareOrdinal(left.id, right.id));
}

export function parseDataPolicy(value: unknown, path: string): ProviderDataPolicy {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["residency", "retentionPolicyUrl"], path);
    const residency = expectArray(record.residency, `${path}.residency`, 32).map((region, index) => {
        const regionPath = `${path}.residency[${index}]`;
        const name = expectString(region, regionPath, 64);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "must be a lowercase region token",
                regionPath,
            );
        }
        return name;
    });
    if (residency.length === 0) {
        throw new ProviderManifestValidationError("invalid_manifest", "must not be empty", `${path}.residency`);
    }
    unique(residency, `${path}.residency`);
    const retentionPolicyUrl =
        record.retentionPolicyUrl === undefined
            ? undefined
            : parseHttpsUrl(record.retentionPolicyUrl, `${path}.retentionPolicyUrl`);
    return { residency: residency.sort(), ...(retentionPolicyUrl ? { retentionPolicyUrl } : {}) };
}

export function parseRecoveryPolicy(value: unknown, path: string): ProviderRecoveryPolicy | undefined {
    if (value === undefined) {
        return undefined;
    }
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["backupFormatVersion", "compatibleBuildRange", "restore", "relocation"], path);
    const restore = expectBoolean(record.restore, `${path}.restore`);
    const relocation = expectBoolean(record.relocation, `${path}.relocation`);
    if (relocation && !restore) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "relocation support requires restore support",
            `${path}.relocation`,
        );
    }
    return {
        backupFormatVersion: expectString(record.backupFormatVersion, `${path}.backupFormatVersion`, 128),
        compatibleBuildRange: parseVersionRange(record.compatibleBuildRange, `${path}.compatibleBuildRange`),
        restore,
        relocation,
    };
}

function parseHttpsUrl(value: unknown, path: string): string {
    const address = expectString(value, path, 2048);
    let url: URL;
    try {
        url = new URL(address);
    } catch {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an absolute HTTPS URL", path);
    }
    if (!address.startsWith("https://") || url.protocol !== "https:" || url.username || url.password) {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an absolute HTTPS URL", path);
    }
    return address;
}

function parsePublicUrl(value: unknown, path: string): string {
    const address = expectString(value, path, 2048);
    let url: URL;
    try {
        url = new URL(address);
    } catch {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an absolute public URL", path);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must use HTTPS or loopback HTTP without URL credentials",
            path,
        );
    }
    return address;
}
