import { createAuthGuard } from "@bernouy/cms-auth";
import {
    REPOSITORY_CANDIDATES_PATH,
    REPOSITORY_CANDIDATE_REPORT_PATH,
    REPOSITORY_CANDIDATE_STATUS_PATH,
    REPOSITORY_MANAGEMENT_BASE_PATH,
} from "cms-repository-management/operations/candidates/contracts";
import {
    REPOSITORY_COMPATIBILITY_PATH,
    REPOSITORY_DIAGNOSTICS_PATH,
    REPOSITORY_RELEASE_PATH,
    REPOSITORY_STATUS_PATH,
    REPOSITORY_VERSIONS_PATH,
} from "cms-repository-management/operations/readRoutes";
import { REPOSITORY_STABLE_PROMOTIONS_PATH } from "cms-repository-management/operations/promotionRoutes";
import { REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH } from "cms-repository-management/operations/reevaluationRoutes";
import { REPOSITORY_VERSION_BLOCKS_PATH } from "cms-repository-management/operations/versionEligibilityRoutes";
import { assertGatewayBodyLimit } from "./body";
import type { RepositoryManagementGatewayConfig } from "./contracts";
import {
    handleRepositoryManagementGatewayRoute,
    type RepositoryManagementGatewayLimits,
    type RepositoryManagementGatewayRoute,
} from "./handler";
import { gatewayError } from "./responses";

const DEFAULT_CANDIDATE_BODY_LIMIT_BYTES = 64 * 1_024 * 1_024;
const DEFAULT_CANDIDATE_CONCURRENCY_LIMIT = 1;
const DEFAULT_BODY_READ_TIMEOUT_MS = 120_000;
const DEFAULT_MUTATION_BODY_LIMIT_BYTES = 64 * 1_024;

const ROUTES: readonly RepositoryManagementGatewayRoute[] = [
    { method: "GET", path: REPOSITORY_STATUS_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_DIAGNOSTICS_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_VERSIONS_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_COMPATIBILITY_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_RELEASE_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_CANDIDATE_STATUS_PATH, body: "none" },
    { method: "GET", path: REPOSITORY_CANDIDATE_REPORT_PATH, body: "none" },
    { method: "POST", path: REPOSITORY_CANDIDATES_PATH, body: "candidate" },
    { method: "POST", path: REPOSITORY_STABLE_PROMOTIONS_PATH, body: "actor-json" },
    { method: "POST", path: REPOSITORY_VERSION_BLOCKS_PATH, body: "actor-json" },
    { method: "POST", path: REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH, body: "actor-json" },
];

export function mountCmsRepositoryManagementGateway<Role extends string>(
    config: RepositoryManagementGatewayConfig<Role>,
): void {
    const candidateLimit = config.candidateBodyLimitBytes ?? DEFAULT_CANDIDATE_BODY_LIMIT_BYTES;
    const candidateConcurrencyLimit = config.candidateConcurrencyLimit ?? DEFAULT_CANDIDATE_CONCURRENCY_LIMIT;
    const bodyReadTimeoutMs = config.bodyReadTimeoutMs ?? DEFAULT_BODY_READ_TIMEOUT_MS;
    const mutationLimit = config.mutationBodyLimitBytes ?? DEFAULT_MUTATION_BODY_LIMIT_BYTES;
    assertGatewayBodyLimit(candidateLimit, "Repository candidate gateway body limit");
    assertGatewayBodyLimit(mutationLimit, "Repository mutation gateway body limit");
    if (!Number.isSafeInteger(candidateConcurrencyLimit) || candidateConcurrencyLimit < 1) {
        throw new TypeError("Repository candidate gateway concurrency limit must be a positive safe integer");
    }
    if (!Number.isSafeInteger(bodyReadTimeoutMs) || bodyReadTimeoutMs < 1) {
        throw new TypeError("Repository gateway body read timeout must be a positive safe integer");
    }
    assertTransport(config.transport);
    let activeCandidateRequests = 0;
    const limits: RepositoryManagementGatewayLimits = {
        candidateBodyBytes: candidateLimit,
        mutationBodyBytes: mutationLimit,
        bodyReadTimeoutMs,
    };

    const guard = createAuthGuard({
        basePath: REPOSITORY_MANAGEMENT_BASE_PATH,
        auth: config.authentication,
        requiredRole: config.requiredRole,
        onUnauthenticated: () => gatewayError(401, "repository_management_unauthorized", "Authentication is required"),
        onApiForbidden: () => gatewayError(403, "repository_management_forbidden", "Administrator access is required"),
    });
    config.runner.group(
        REPOSITORY_MANAGEMENT_BASE_PATH,
        (runner) => {
            for (const route of ROUTES) {
                runner.addEndpoint(route.method, route.path, async (request) => {
                    if (route.body !== "candidate") {
                        return await handleRepositoryManagementGatewayRoute(request, route, config, limits);
                    }
                    if (activeCandidateRequests >= candidateConcurrencyLimit) {
                        return gatewayBusy();
                    }
                    activeCandidateRequests += 1;
                    try {
                        return await handleRepositoryManagementGatewayRoute(request, route, config, limits);
                    } finally {
                        activeCandidateRequests -= 1;
                    }
                });
            }
        },
        [guard],
    );
}

function gatewayBusy(): Response {
    const response = gatewayError(
        429,
        "repository_management_candidate_busy",
        "Another repository candidate upload is in progress",
    );
    response.headers.set("retry-after", "1");
    return response;
}

function assertTransport(value: RepositoryManagementGatewayConfig<string>["transport"]): void {
    if (!value || typeof value.forward !== "function") {
        throw new TypeError("Repository management gateway transport is required");
    }
}
