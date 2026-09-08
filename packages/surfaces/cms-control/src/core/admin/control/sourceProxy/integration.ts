import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";
import { executeIntegrationEndpoint, IntegrationInputError, IntegrationRuntimeError } from "@bernouy/cms-integrations";
import type { ControlCmsState } from "../types";
import { publishedPageResolver } from "cms-control/core/management/integrations/runtime/publishedPageResolver";
import { syncIntegrationRuntimeSecrets } from "cms-control/core/management/integrations/runtime/runtimeSecrets";
import type { Subject } from "@bernouy/cms-auth";
import type { CMS_ROLES } from "types/roles";

export function integrationEndpointInterceptor(
    state: ControlCmsState,
    resolveSubject: (request: Request) => Promise<Subject<CMS_ROLES> | null>,
): SourceEndpointInterceptor {
    return async (endpoint, request, next) => {
        if (!endpoint.integrationContext) {
            return next(request);
        }
        if (!state.integrationInstallations) {
            return Response.json({ error: "Integration runtime is unavailable" }, { status: 503 });
        }
        const subject = await resolveSubject(request);
        if (!subject) {
            return new Response("Unauthorized", { status: 401 });
        }
        try {
            return await executeIntegrationEndpoint(
                {
                    installations: state.integrationInstallations,
                    secrets: state.secrets,
                    resolvePublishedPage: publishedPageResolver(state.repository, state.configuration.deliveryUrl),
                    syncRuntimeSecrets: (installation, values) =>
                        syncIntegrationRuntimeSecrets(
                            state.configuration.integrationConnectorDeployers,
                            installation,
                            values,
                        ),
                },
                endpoint,
                request,
                next,
                { id: subject.identifier, role: subject.role },
            );
        } catch (error) {
            const status =
                error instanceof IntegrationRuntimeError
                    ? error.status
                    : error instanceof IntegrationInputError
                      ? 400
                      : 502;
            return Response.json(
                {
                    error:
                        error instanceof IntegrationRuntimeError || error instanceof IntegrationInputError
                            ? error.message
                            : "Integration operation failed",
                },
                { status },
            );
        }
    };
}
