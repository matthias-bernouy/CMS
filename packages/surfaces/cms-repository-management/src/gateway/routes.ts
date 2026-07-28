import { createAuthGuard, resolveRequestSubject } from "@bernouy/cms-auth";
import type { Runner } from "@bernouy/http-runner";
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
import { assertGatewayBodyLimit, injectAuthenticatedActor, readGatewayBody } from "./body";
import type { RepositoryManagementGatewayConfig, RepositoryManagementGatewayRequest } from "./contracts";
import { gatewayError, sanitizedGatewayResponse } from "./responses";

const DEFAULT_CANDIDATE_BODY_LIMIT_BYTES = 64 * 1_024 * 1_024;
const DEFAULT_MUTATION_BODY_LIMIT_BYTES = 64 * 1_024;

type Route = Readonly<{ method: "GET" | "POST"; path: string; body: "none" | "candidate" | "actor-json" }>;

const ROUTES: readonly Route[] = [
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
    const mutationLimit = config.mutationBodyLimitBytes ?? DEFAULT_MUTATION_BODY_LIMIT_BYTES;
    assertGatewayBodyLimit(candidateLimit, "Repository candidate gateway body limit");
    assertGatewayBodyLimit(mutationLimit, "Repository mutation gateway body limit");
    assertTransport(config.transport);

    const guard = createAuthGuard({
        basePath: REPOSITORY_MANAGEMENT_BASE_PATH,
        auth: config.authentication,
        requiredRole: config.requiredRole,
        onUnauthenticated: () => gatewayError(401, "repository_management_unauthorized", "Authentication is required"),
        onForbidden: () => gatewayError(403, "repository_management_forbidden", "Administrator access is required"),
    });
    config.runner.group(
        REPOSITORY_MANAGEMENT_BASE_PATH,
        (runner) => {
            for (const route of ROUTES) {
                runner.addEndpoint(route.method, route.path, (request) =>
                    handleRoute(request, route, config, candidateLimit, mutationLimit),
                );
            }
        },
        [guard],
    );
}

async function handleRoute<Role extends string>(
    request: Request,
    route: Route,
    config: RepositoryManagementGatewayConfig<Role>,
    candidateLimit: number,
    mutationLimit: number,
): Promise<Response> {
    const subject = await resolveRequestSubject(config.authentication, request).catch(() => null);
    if (!subject || subject.role !== config.requiredRole || !validActor(subject.identifier)) {
        return gatewayError(403, "repository_management_forbidden", "Administrator access is required");
    }
    try {
        const forwarded = await gatewayRequest(request, route, subject.identifier, candidateLimit, mutationLimit);
        return sanitizedGatewayResponse(await config.transport.forward(forwarded));
    } catch (error) {
        if (error && typeof error === "object" && "status" in error) {
            const status = (error as { status?: unknown }).status;
            if (status === 400 || status === 413) {
                return gatewayError(
                    status,
                    status === 413 ? "repository_management_too_large" : "repository_management_invalid",
                    "Management request body is invalid",
                );
            }
        }
        return gatewayError(503, "repository_management_unavailable", "Repository management is unavailable");
    }
}

async function gatewayRequest(
    request: Request,
    route: Route,
    actor: string,
    candidateLimit: number,
    mutationLimit: number,
): Promise<RepositoryManagementGatewayRequest> {
    const url = new URL(request.url);
    if (route.body === "none") {
        return { actor, method: route.method, path: route.path, query: url.search };
    }
    const limit = route.body === "candidate" ? candidateLimit : mutationLimit;
    const input = await readGatewayBody(request, limit);
    const body = route.body === "actor-json" ? injectAuthenticatedActor(input, actor, limit) : input;
    return {
        actor,
        method: route.method,
        path: route.path,
        query: url.search,
        contentType: request.headers.get("content-type") ?? "application/json",
        body,
    };
}

function validActor(value: string): boolean {
    return Boolean(value.trim()) && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function assertTransport(value: RepositoryManagementGatewayConfig<string>["transport"]): void {
    if (!value || typeof value.forward !== "function") {
        throw new TypeError("Repository management gateway transport is required");
    }
}
