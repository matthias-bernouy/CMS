import { importRepositoryArtifact } from "@bernouy/cms-repository/providers/sources";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireProviderResources } from "cms-control/core/admin/providerResources/access";

/** Import one exact release, then select the matching approved provider account. */
export default async function selectSource(request: Request, cms: ControlCms): Promise<Response> {
    const { resources } = await requireProviderResources(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some(
            (key) => !["repositoryId", "publisherId", "id", "version", "digest", "installationId"].includes(key),
        ) ||
        ["repositoryId", "publisherId", "id", "version", "digest", "installationId"].some(
            (key) => typeof body[key] !== "string",
        )
    ) {
        throw new InvalidParam("body", "Exact contract release and provider installation expected");
    }
    const source = resources.sources.find((item) => item.id === body.repositoryId);
    if (!source || !resources.management) {
        throw new InvalidParam("repositoryId", "Provider source is unavailable");
    }
    const reference = {
        kind: "contract" as const,
        publisherId: body.publisherId as string,
        id: body.id as string,
        version: body.version as string,
        digest: body.digest as string,
    };
    const installations = (await resources.management.list()) as {
        installations: {
            id: string;
            status: string;
            contracts: { contractId: string; version: string; digest: string; status: string }[];
        }[];
    };
    const installation = installations.installations.find((item) => item.id === body.installationId);
    if (
        installation?.status !== "enabled" ||
        !installation?.contracts.some(
            (item) =>
                item.contractId === reference.id &&
                item.version === reference.version &&
                item.digest === reference.digest &&
                item.status === "ready",
        )
    ) {
        throw new InvalidParam("installationId", "Provider does not report this contract release as ready");
    }
    await importRepositoryArtifact(source, reference, resources.contracts, resources.manifests);
    const result = await resources.management.selectContract({
        installationId: body.installationId as string,
        contractId: reference.id,
        version: reference.version,
        digest: reference.digest,
    });
    return Response.json(result, { status: 201 });
}
