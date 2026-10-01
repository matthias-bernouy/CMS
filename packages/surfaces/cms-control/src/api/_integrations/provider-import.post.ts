import { importRepositoryArtifact, type RepositoryArtifactReference } from "@bernouy/cms-repository/providers/sources";
import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireProviderResources } from "cms-control/core/admin/providerResources/access";

export default async function importProviderResource(request: Request, cms: ControlCms): Promise<Response> {
    const { sources, contracts, manifests } = (await requireProviderResources(request, cms)).resources;
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some(
            (key) => !["repositoryId", "kind", "publisherId", "id", "version", "digest"].includes(key),
        ) ||
        typeof body.repositoryId !== "string" ||
        (body.kind !== "contract" && body.kind !== "provider-manifest") ||
        typeof body.publisherId !== "string" ||
        typeof body.id !== "string" ||
        typeof body.version !== "string" ||
        typeof body.digest !== "string"
    ) {
        throw new InvalidParam("body", "Exact repository artifact reference expected");
    }
    const source = sources.find((candidate) => candidate.id === body.repositoryId);
    if (!source) {
        throw new InvalidParam("repositoryId", "Unknown provider repository");
    }
    const reference: RepositoryArtifactReference = {
        kind: body.kind,
        publisherId: body.publisherId,
        id: body.id,
        version: body.version,
        digest: body.digest,
    };
    const result = await importRepositoryArtifact(source, reference, contracts, manifests);
    return Response.json(result, { status: 201 });
}
