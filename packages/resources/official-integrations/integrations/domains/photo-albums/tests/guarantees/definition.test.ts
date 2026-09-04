import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { projectDataShape, type DataShape } from "@bernouy/cms-sources";

const integrationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

type EndpointArtifact = {
    endpointId: string;
    access?: string;
    params?: Array<{ name: string; in: string; required?: boolean }>;
    responseKind?: string;
    effects?: {
        producesMedia?: Array<{
            version: number;
            targetEndpoint: string;
            params: Record<string, unknown>;
            revision?: Record<string, unknown>;
        }>;
        removesMedia?: Array<{ params: Record<string, unknown> }>;
    };
    output?: Array<{ status: string; body?: DataShape }>;
};

type SourceArtifact = {
    type: "source";
    source: {
        endpoints: EndpointArtifact[];
    };
};

async function resolvedDefinition(): Promise<Record<string, unknown>> {
    return (await resolveIntegrationDefinitionFile(
        resolve(integrationRoot, "definition.json"),
        integrationRoot,
    )) as Record<string, unknown>;
}

function sourceArtifact(definition: Record<string, unknown>): SourceArtifact {
    const artifacts = definition.artifacts as Array<{ type?: string }>;
    const source = artifacts.find((artifact) => artifact.type === "source");
    if (!source) {
        throw new Error("Photo Albums source artifact is missing");
    }
    return source as SourceArtifact;
}

describe("Photo Albums declarative contract", () => {
    test("resolves and parses the complete current definition", async () => {
        const definition = await resolvedDefinition();
        const parsed = parseIntegrationDefinition(definition);

        expect(parsed.kind).toBe("photo-albums");
        expect(parsed.version).toBe("3.1.0");
        expect(parsed.artifacts?.map((artifact) => artifact.type)).toEqual([
            "source",
            "dashboard-view",
            "dashboard-view",
            "dashboard-view",
        ]);
        expect(parsed.afterInstallation?.[0]?.steps).toHaveLength(1);
    });

    test("declares public catalogue and responsive photo endpoints", async () => {
        const endpoints = sourceArtifact(await resolvedDefinition()).source.endpoints;
        const ids = new Set(endpoints.map((endpoint) => endpoint.endpointId));
        expect([...ids].sort()).toEqual(
            [
                "album",
                "albums",
                "archiveAlbum",
                "categories",
                "deleteCategory",
                "health",
                "manageAlbum",
                "manageAlbums",
                "manageCategories",
                "manageCategory",
                "managePhoto",
                "photo",
                "publicPhoto",
                "removePhoto",
                "reorderAlbums",
                "reorderCategories",
                "reorderPhotos",
                "replacePhoto",
                "settings",
                "setup",
                "updateSettings",
                "updatePhoto",
                "uploadPhoto",
                "upsertAlbum",
                "upsertCategory",
            ].sort(),
        );

        for (const id of ["categories", "albums", "album", "publicPhoto"]) {
            expect(ids.has(id)).toBe(true);
            expect(endpoints.find((endpoint) => endpoint.endpointId === id)?.access).toBe("public");
        }
        expect(endpoints.find((endpoint) => endpoint.endpointId === "publicPhoto")).toMatchObject({
            responseKind: "file",
            output: [{ status: "200" }, { status: "206" }],
        });

        for (const id of ["uploadPhoto", "replacePhoto"]) {
            const queryParams = endpoints
                .find((endpoint) => endpoint.endpointId === id)
                ?.params?.filter((param) => param.in === "query")
                .map((param) => param.name);
            expect(queryParams).toEqual(expect.arrayContaining(["albumId", "alt", "caption", "takenAt"]));
        }
        expect(endpoints.find((endpoint) => endpoint.endpointId === "updatePhoto")?.access).toBe("admin");
    });

    test("projects nullable category and cover photo values", async () => {
        const endpoints = sourceArtifact(await resolvedDefinition()).source.endpoints;
        const shape = endpoints.find((endpoint) => endpoint.endpointId === "album")?.output?.[0]?.body;
        if (!shape) {
            throw new Error("Public album response shape is missing");
        }

        const projected = projectDataShape(
            {
                id: 7,
                slug: "summer",
                title: "Summer",
                description: null,
                category: null,
                coverPhoto: null,
                photos: [],
                photoCount: 0,
                publishedAt: null,
            },
            shape,
        );

        expect(projected).toMatchObject({
            ok: true,
            value: {
                category: null,
                coverPhoto: null,
            },
        });
    });

    test("declares eager media production and invalidation effects", async () => {
        const endpoints = sourceArtifact(await resolvedDefinition()).source.endpoints;
        const upload = endpoints.find((endpoint) => endpoint.endpointId === "uploadPhoto");
        const replace = endpoints.find((endpoint) => endpoint.endpointId === "replacePhoto");
        const remove = endpoints.find((endpoint) => endpoint.endpointId === "removePhoto");

        expect(upload?.effects?.producesMedia?.[0]).toMatchObject({
            version: 1,
            targetEndpoint: "publicPhoto",
            params: { id: { responsePath: "id" } },
            revision: { responsePath: "version" },
        });
        expect(replace?.effects?.removesMedia?.[0]?.params.id).toEqual({ requestParam: "photoId" });
        expect(remove?.effects?.removesMedia?.[0]?.params.id).toEqual({ responsePath: "photoId" });
    });
});
