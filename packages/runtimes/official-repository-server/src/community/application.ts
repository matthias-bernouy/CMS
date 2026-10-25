import { CapabilityGateway } from "@bernouy/cms-gateway";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { matchPathTemplate } from "@bernouy/cms-repository/contracts/bindings";
import {
    admitRepositoryContract,
    RepositoryCapabilityService,
    RepositoryCapabilityError,
} from "@bernouy/cms-repository/repository/contract";
import type { RepositoryCapabilityPorts } from "@bernouy/cms-repository/repository/contract";
import { repositoryRoute } from "./route";
import { RepositoryCommandAudit } from "./audit";

export async function createRepositoryCapabilities(root: string, ports: RepositoryCapabilityPorts) {
    const contract = await admitRepositoryContract();
    const route = await repositoryRoute(contract);
    const service = new RepositoryCapabilityService(ports);
    const gateway = new CapabilityGateway({
        routes: {
            async resolve(siteId, contractId) {
                return siteId === "repository" && contractId === contract.release.contractId ? route() : null;
            },
            async isCurrent() {
                return true;
            },
        },
        authorize: async (_actor, capability) => capability.access === "public",
        commandAudit: new RepositoryCommandAudit(root),
        transport: {
            async send(request) {
                try {
                    const output = await service.invoke(request.capability.id, request.input, request.binaryBody);
                    if (request.capability.output.type === "binary") {
                        const binary = output as Awaited<ReturnType<RepositoryCapabilityPorts["release"]>>;
                        return {
                            contentType: binary!.contentType,
                            contentLength: binary!.contentLength,
                            stream: binary!.stream,
                        };
                    }
                    return { output };
                } catch (error) {
                    if (error instanceof RepositoryCapabilityError) {
                        return { errorCode: error.code };
                    }
                    throw error;
                }
            },
        },
    });
    return async (request: Request): Promise<Response | null> => {
        const url = new URL(request.url);
        if (url.pathname === "/v1/repository-contract" && (request.method === "GET" || request.method === "HEAD")) {
            return new Response(request.method === "HEAD" ? null : contract.canonicalJson, {
                headers: { "Content-Type": "application/json", ETag: `"${contract.digest}"` },
            });
        }
        const prefix = "/.cms/call";
        const direct = contract.bindings.some(
            ({ binding }) =>
                (binding.method === request.method || (request.method === "HEAD" && binding.method === "GET")) &&
                matchPathTemplate(binding.path, url.pathname) !== null,
        );
        if (!direct && !url.pathname.startsWith(`${prefix}/`)) {
            return null;
        }
        if (direct) {
            url.pathname = `${prefix}/${contract.release.contractId}${url.pathname}`;
        }
        const response = await handleGatewayHttpCall(new Request(url, request), {
            siteId: "repository",
            invoker: gateway,
            actor: { kind: "anonymous" },
            prefix,
        });
        if (url.pathname.includes("/v1/source-snapshots")) {
            response.headers.set("Cache-Control", "no-store");
        }
        return response;
    };
}
