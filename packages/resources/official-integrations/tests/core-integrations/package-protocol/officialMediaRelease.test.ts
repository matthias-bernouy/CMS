import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";

describe("official Photo Albums eager-media release", () => {
    test("publishes 1.2.0 as a separate unverified package with versioned media effects", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const index = await repository.getIndex("photo-albums");
        const definition = await repository.get("photo-albums", "1.2.0");
        const source = definition?.artifacts?.find((artifact) => artifact.type === "source");
        const endpoints = source?.type === "source" ? source.source.endpoints : [];
        const upload = endpoints.find((endpoint) => endpoint.endpointId === "uploadPhoto");
        const replace = endpoints.find((endpoint) => endpoint.endpointId === "replacePhoto");
        const remove = endpoints.find((endpoint) => endpoint.endpointId === "removePhoto");

        expect(index?.versions.find(({ version }) => version === "1.2.0")?.status).toBe("unverified");
        expect(definition?.version).toBe("1.2.0");
        expect(upload?.effects?.producesMedia?.[0]).toMatchObject({
            version: 1,
            targetEndpoint: "publicPhoto",
            params: { id: { responsePath: "id" } },
            revision: { responsePath: "version" },
        });
        expect(replace?.effects?.removesMedia?.[0]?.params.id).toEqual({ requestParam: "photoId" });
        expect(remove?.effects?.removesMedia?.[0]?.params.id).toEqual({ responsePath: "photoId" });

        const packages = await buildOfficialIntegrationPackages();
        expect(packages.some(({ kind, version }) => kind === "photo-albums" && version === "1.2.0")).toBeTrue();
    });
});
