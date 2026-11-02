import {
    admitRepositoryContract,
    RepositoryCapabilityService,
    RepositoryCapabilityError,
} from "@bernouy/cms-repository/repository/contract";
import type { RepositoryCapabilityPorts } from "@bernouy/cms-repository/repository/contract";
import type { RepositoryReadEndpoint } from "@bernouy/cms-repository/repository/filesystem";
import { FilesystemRepositorySourceStore } from "@bernouy/cms-repository/repository/sources";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";

// Mount the real signed source operations; Linux process ownership stays outside this harness.
export async function sourceSnapshots(
    root: string,
    ports: Omit<RepositoryCapabilityPorts, "sources" | "catalogue" | "release">,
    reads: RepositoryReadEndpoint,
) {
    const contract = await admitRepositoryContract();
    const service = new RepositoryCapabilityService({
        ...ports,
        sources: new FilesystemRepositorySourceStore(root),
        catalogue: async () => {
            throw new Error("Catalogue is served by RepositoryReadEndpoint");
        },
        async release(coordinate) {
            const path = `/v1/collections/${[coordinate.publisherId, coordinate.id, coordinate.version].map(encodeURIComponent).join("/")}`;
            const response = await reads.handle(new Request(`http://repository.local${path}`));
            if (!response?.ok || !response.body) {
                return null;
            }
            return {
                stream: response.body,
                contentType: "application/json",
                contentLength: Number(response.headers.get("content-length")),
                digest: response.headers.get("etag")!.replace(/^"|"$/gu, ""),
            };
        },
    });
    return async (request: Request) => {
        const path = new URL(request.url).pathname;
        const capability = contract.release.capabilities.find(
            (candidate) =>
                ["source-get", "source-put"].includes(candidate.id) &&
                candidate.bindings.some(
                    (binding) =>
                        binding.transport === "http" && binding.method === request.method && binding.path === path,
                ),
        );
        if (!capability) {
            return null;
        }
        try {
            const input = parseStrictJson(await request.text(), 2 * 1024 * 1024, 32);
            validateSchemaValue(capability.input, input);
            return Response.json(await service.invoke(capability.id, input as Record<string, unknown>));
        } catch (error) {
            return Response.json(
                { error: String(error) },
                { status: error instanceof RepositoryCapabilityError ? 403 : 422 },
            );
        }
    };
}
