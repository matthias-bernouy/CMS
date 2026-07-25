import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { projectDataShape, type DataShape } from "@bernouy/cms-sources";

const versionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type EndpointArtifact = {
    endpointId: string;
    access?: string;
    responseKind?: string;
    output?: Array<{ status: string; body?: DataShape }>;
};

type SourceArtifact = {
    type: "source";
    source: {
        endpoints: EndpointArtifact[];
    };
};

async function resolvedDefinition(): Promise<Record<string, unknown>> {
    return (await resolveIntegrationDefinitionFile(resolve(versionRoot, "definition.json"), versionRoot)) as Record<
        string,
        unknown
    >;
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
    test("resolves and parses the complete 1.0.0 definition", async () => {
        const definition = await resolvedDefinition();
        const parsed = parseIntegrationDefinition(definition);

        expect(parsed.kind).toBe("photo-albums");
        expect(parsed.version).toBe("1.0.0");
        expect(parsed.artifacts).toHaveLength(6);
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
});
