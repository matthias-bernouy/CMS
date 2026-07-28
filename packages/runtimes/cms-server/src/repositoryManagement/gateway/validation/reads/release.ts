import { parsePublicRepositoryRelease } from "../../../../repositoryCatalog/release/parser";
import type { RepositoryManagementTransportResponse } from "../../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "../errors";
import { assertEqual } from "../helpers";

export function validateReleaseResponse(
    response: RepositoryManagementTransportResponse,
    expected: Readonly<{ kind: string; version: string }>,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 404) {
        return simpleErrorResult(response, 404, "release_evidence_not_found", "Release evidence was not found");
    }
    assertEqual(response.status, 200);
    const release = parsePublicRepositoryRelease(response.body, expected);
    return { status: 200, body: { ...release } };
}
