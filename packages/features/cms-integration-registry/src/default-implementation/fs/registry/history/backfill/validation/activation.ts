import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    integrationVersionReleaseLevel,
    isIntegrationPrerelease,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { IntegrationVerificationBackfillError } from "../../../../../../core/publication/backfill";

export function backfilledIntegrationIndex(
    previous: IntegrationDefinitionIndex,
    kind: string,
    version: string,
    verificationDigest: string,
): IntegrationDefinitionIndex {
    let matched = 0;
    const versions = previous.versions.map((entry) => {
        if (entry.version !== version) {
            return entry;
        }
        matched += 1;
        if (entry.verificationDigest && entry.verificationDigest !== verificationDigest) {
            throw new IntegrationVerificationBackfillError(
                409,
                "verification_backfill_conflict",
                "Integration version already references another verification bundle",
            );
        }
        if (entry.status === "unverified") {
            const { status: _, ...eligible } = entry;
            return { ...eligible, verificationDigest };
        }
        return { ...entry, verificationDigest };
    });
    if (previous.kind !== kind || matched !== 1) {
        throw new IntegrationVerificationBackfillError(
            400,
            "verification_backfill_invalid",
            "Integration verification backfill target is absent from its exact index",
        );
    }
    const installable = versions.filter((entry) => entry.status === undefined);
    const stable = newest(installable.filter((entry) => !isIntegrationPrerelease(entry.version)));
    const latest = newest(installable);
    return parseIntegrationDefinitionIndex(
        {
            ...previous,
            versions,
            ...(stable ? { stable: stable.version } : { stable: undefined }),
            ...(latest ? { latest: latest.version } : { latest: undefined }),
        },
        `verification-backfill:${kind}@${version}`,
    );
}

export function sameIntegrationIndex(
    left: IntegrationDefinitionIndex | null,
    right: IntegrationDefinitionIndex | null,
): boolean {
    if (!left || !right) {
        return left === right;
    }
    return equalBytes(canonicalJsonBytes(left), canonicalJsonBytes(right));
}

function newest(versions: readonly IntegrationDefinitionVersion[]): IntegrationDefinitionVersion | undefined {
    return versions.reduce<IntegrationDefinitionVersion | undefined>((current, candidate) => {
        if (!current || integrationVersionReleaseLevel(current.version, candidate.version)) {
            return candidate;
        }
        return current;
    }, undefined);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
