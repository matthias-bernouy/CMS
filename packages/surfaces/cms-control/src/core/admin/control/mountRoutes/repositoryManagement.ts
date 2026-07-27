import type { Runner } from "@bernouy/http-runner";
import type { RepositoryManagementAccess } from "cms-control/core/admin/control/mountRoutes/repositoryAccess";
import {
    readRepositoryControlBody,
    readRepositoryControlJson,
} from "cms-control/core/admin/control/mountRoutes/repositoryBody";
import {
    parseRepositoryPromotion,
    parseRepositoryReevaluation,
    parseRepositoryVersionBlock,
    repositoryCompatibilityQuery,
    repositoryRequiredQuery,
} from "cms-control/core/admin/control/mountRoutes/repositoryInputs";
import {
    repositoryControlErrorResponse,
    repositoryGatewayResponse,
    repositoryJsonResponse,
} from "cms-control/core/admin/control/mountRoutes/repositoryResponse";

const MAX_PACKAGE_BYTES = 32 * 1_024 * 1_024;
const MAX_JSON_BYTES = 64 * 1_024;

export function mountRepositoryManagementRoutes(runner: Runner, access: RepositoryManagementAccess | undefined): void {
    runner.get("/repository/status", () => callGateway(access, (gateway) => gateway.status()));
    runner.get("/repository/diagnostics", () => callGateway(access, (gateway) => gateway.diagnostics()));
    runner.get("/repository/versions", (request) =>
        callGateway(access, (gateway) => gateway.versions(repositoryRequiredQuery(request, "kind"))),
    );
    runner.get("/repository/release", (request) =>
        callGateway(access, (gateway) =>
            gateway.release(repositoryRequiredQuery(request, "kind"), repositoryRequiredQuery(request, "version")),
        ),
    );
    runner.get("/repository/compatibility", (request) =>
        callGateway(access, (gateway) => gateway.compatibility(repositoryCompatibilityQuery(request))),
    );
    runner.post("/repository/candidates", async (request) =>
        callGateway(access, async (gateway) =>
            gateway.submitCandidate(await readRepositoryControlBody(request, MAX_PACKAGE_BYTES)),
        ),
    );
    runner.get("/repository/candidates/status", (request) =>
        callGateway(access, (gateway) => gateway.candidateStatus(repositoryRequiredQuery(request, "candidateId"))),
    );
    runner.get("/repository/candidates/report", (request) =>
        callGateway(access, (gateway) => gateway.candidateReport(repositoryRequiredQuery(request, "candidateId"))),
    );
    runner.post("/repository/reevaluations", async (request) =>
        callGateway(access, async (gateway) =>
            gateway.reevaluate(parseRepositoryReevaluation(await readRepositoryControlJson(request, MAX_JSON_BYTES))),
        ),
    );
    runner.post("/repository/stable-promotions", async (request) =>
        callGateway(access, async (gateway) =>
            gateway.promoteStable(parseRepositoryPromotion(await readRepositoryControlJson(request, MAX_JSON_BYTES))),
        ),
    );
    runner.post("/repository/version-blocks", async (request) =>
        callGateway(access, async (gateway) =>
            gateway.blockVersion(parseRepositoryVersionBlock(await readRepositoryControlJson(request, MAX_JSON_BYTES))),
        ),
    );
}

async function callGateway(
    access: RepositoryManagementAccess | undefined,
    invoke: (gateway: NonNullable<RepositoryManagementAccess["gateway"]>) => Promise<Response>,
): Promise<Response> {
    if (!access?.gateway) {
        return repositoryJsonResponse(404, { code: "repository_management_not_configured", error: "Not Found" });
    }
    try {
        return await repositoryGatewayResponse(await invoke(access.gateway));
    } catch (error) {
        return repositoryControlErrorResponse(error);
    }
}
