import type { RepositoryManagementTransportResponse } from "../../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "../errors";
import {
    array,
    assertEqual,
    boolean,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    packageKind,
    packageVersion,
    type JsonObject,
} from "../helpers";

const COMPATIBILITY_OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;
const VERSION_STATUSES = ["blocked", "inadmissible", "unverified"] as const;

export function validateVersionsResponse(
    response: RepositoryManagementTransportResponse,
    expectedKind: string,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 404) {
        return simpleErrorResult(response, 404, "integration_not_found", "Integration was not found");
    }
    assertEqual(response.status, 200);
    const body = exactObject(response.body, ["kind", "versions"], ["stable", "latest"]);
    assertEqual(packageKind(body.kind), expectedKind);
    const versions = array(body.versions).map(validateVersionSummary);
    const versionNames = versions.map((entry) => entry.version as string);
    if (new Set(versionNames).size !== versionNames.length) {
        throw new TypeError("Repository versions are not unique");
    }
    for (const channel of [body.stable, body.latest]) {
        if (channel !== undefined && !versionNames.includes(packageVersion(channel))) {
            throw new TypeError("Repository channel is not present in versions");
        }
    }
    return { status: 200, body };
}

function validateVersionSummary(value: unknown): JsonObject {
    const summary = exactObject(value, ["version", "compatibility"], ["blockPreview", "digest", "release", "status"]);
    packageVersion(summary.version);
    if (summary.digest !== undefined) {
        digest(summary.digest);
    }
    if (summary.compatibility !== null) {
        const compatibility = exactObject(summary.compatibility, [
            "admissionReportId",
            "currentReportRevisionId",
            "outcome",
            "admissible",
            "warning",
        ]);
        canonicalText(compatibility.admissionReportId, 512);
        canonicalText(compatibility.currentReportRevisionId, 512);
        enumValue(compatibility.outcome, COMPATIBILITY_OUTCOMES);
        boolean(compatibility.admissible);
        boolean(compatibility.warning);
    }
    if (summary.status !== undefined) {
        enumValue(summary.status, VERSION_STATUSES);
    }
    if (summary.blockPreview !== undefined) {
        const preview = exactObject(summary.blockPreview, ["current", "next"]);
        validateChannels(preview.current);
        validateChannels(preview.next);
    }
    if (summary.release !== undefined) {
        validateReleaseSummary(summary.release);
    }
    return summary;
}

function validateReleaseSummary(value: unknown): void {
    const release = exactObject(
        value,
        ["admissible"],
        ["decisionDigest", "decisionRevisionId", "verificationDigest", "verificationOrigin", "verificationOutcome"],
    );
    boolean(release.admissible);
    for (const key of ["decisionDigest", "verificationDigest"] as const) {
        if (release[key] !== undefined) {
            digest(release[key]);
        }
    }
    for (const key of ["decisionRevisionId", "verificationOutcome"] as const) {
        if (release[key] !== undefined) {
            canonicalText(release[key], 1_024);
        }
    }
    if (release.verificationOrigin !== undefined) {
        enumValue(release.verificationOrigin, ["admission", "legacy-backfill"] as const);
    }
}

function validateChannels(value: unknown): void {
    const channels = exactObject(value, [], ["latest", "stable"]);
    if (channels.stable !== undefined) {
        packageVersion(channels.stable);
    }
    if (channels.latest !== undefined) {
        packageVersion(channels.latest);
    }
}
