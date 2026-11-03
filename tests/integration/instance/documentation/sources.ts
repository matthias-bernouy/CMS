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
            const type =
                coordinate.kind === "collection"
                    ? "collections"
                    : coordinate.kind === "contract"
                      ? "contracts"
                      : "providers";
            const path = `/v1/${type}/${[coordinate.publisherId, coordinate.id, coordinate.version].map(encodeURIComponent).join("/")}`;
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
        const segments = path.split("/");
        if (
            (request.method === "GET" || request.method === "HEAD") &&
            segments.length === 7 &&
            segments[1] === "v1" &&
            segments[2] === "releases"
        ) {
            const [kind, publisherId, id, version] = segments.slice(3).map(decodeURIComponent);
            const capability = contract.release.capabilities.find((candidate) => candidate.id === "release-download")!;
            const input = { kind, publisherId, id, version };
            validateSchemaValue(capability.input, input);
            const result = (await service.invoke("release-download", input)) as Awaited<
                ReturnType<RepositoryCapabilityPorts["release"]>
            >;
            if (!result) {
                return new Response(null, { status: 404 });
            }
            if (request.method === "HEAD") {
                await result.stream.cancel();
            }
            return new Response(request.method === "HEAD" ? null : result.stream, {
                headers: { "Content-Type": result.contentType, "Content-Length": String(result.contentLength) },
            });
        }
        const capability = contract.release.capabilities.find(
            (candidate) =>
                ["source-get", "source-put", "catalogue-search"].includes(candidate.id) &&
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
