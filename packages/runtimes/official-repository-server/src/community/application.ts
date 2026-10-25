import { CapabilityGateway } from "@bernouy/cms-gateway";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { CapabilityMcpBinding, createCapabilityMcpHttpHandler } from "@bernouy/cms-gateway/mcp";
import { matchPathTemplate } from "@bernouy/cms-repository/contracts/bindings";
import {
    admitRepositoryContract,
    RepositoryCapabilityService,
    RepositoryCapabilityError,
} from "@bernouy/cms-repository/repository/contract";
import type { RepositoryCapabilityPorts } from "@bernouy/cms-repository/repository/contract";
import type { RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";
import { repositoryRoute } from "./route";
import { RepositoryCommandAudit } from "./audit";
import { repositoryReleasePath } from "./catalogue";

export async function createRepositoryCapabilities(root: string, ports: RepositoryCapabilityPorts, publicUrl: string) {
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
        if (url.pathname === "/mcp") {
            const binding = new CapabilityMcpBinding({
                invoker: gateway,
                contracts: async () => [contract],
                publishBinary: async (result, capability, _context, input) => {
                    await result.stream.cancel();
                    if (capability.id !== "release-download") {
                        throw new Error("Unknown public resource representation");
                    }
                    return {
                        type: "resource_link",
                        uri: new URL(repositoryReleasePath(input as unknown as RemoteCoordinate), publicUrl).href,
                        name: String(input.id),
                        mimeType: result.contentType,
                    };
                },
            });
            return createCapabilityMcpHttpHandler({
                binding,
                allowedOrigins: [],
                serverInfo: { name: "ulvia-repository", version: contract.release.version },
                resolveContext: async () => ({ siteId: "repository", actor: { kind: "anonymous" } }),
            })(request);
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
        return handleGatewayHttpCall(new Request(url, request), {
            siteId: "repository",
            invoker: gateway,
            actor: { kind: "anonymous" },
            prefix,
        });
    };
}
