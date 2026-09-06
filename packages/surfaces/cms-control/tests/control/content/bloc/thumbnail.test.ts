import { describe, expect, test } from "bun:test";
import { parsePresentationImage } from "@bernouy/cms-content";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { importBlocArtifact } from "cms-control/core/content/bloc/importBlocArtifact";
import { cliBlocSource, cliBlocList } from "cms-control/core/content/bloc/cliExport";
import getBlocThumbnail from "cms-control/api/_content/bloc/_runtime/thumbnail.get";
import { siteBlocHarness } from "../../site-blocs/fixtures";

describe("authored presentation images", () => {
    test("compiles, persists, lists, exports and serves the manifest thumbnail", async () => {
        const { cms, repository } = siteBlocHarness();
        const thumbnail = { path: "assets/thumbnails/card.svg", alt: "A card containing a title and action" };
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>';
        const source = {
            "manifest.json": btoa(JSON.stringify({ thumbnail })),
            [thumbnail.path]: btoa(svg),
        };
        await importBlocArtifact(cms, {
            tag: "example-card",
            name: "Card",
            compositionHTML: "<article><slot></slot></article>",
            source,
        });
        expect((await repository.getBlocRecord("example-card"))?.artifact?.thumbnail).toEqual(thumbnail);
        expect((await repository.getBlocsList())[0]?.thumbnail).toEqual(thumbnail);
        expect((await cliBlocList(repository))[0]?.thumbnail).toEqual(thumbnail);
        expect(await cliBlocSource(repository, "example-card")).toEqual(source);
        const response = await getBlocThumbnail(
            new Request("http://localhost/api/bloc/thumbnail?id=example-card"),
            cms,
        );
        expect(response.headers.get("content-type")).toBe("image/svg+xml");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("content-security-policy")).toContain("sandbox");
        expect(await response.text()).toBe(svg);
    });

    test("missing or corrupt optional image bytes do not become executable responses", async () => {
        const { cms } = siteBlocHarness();
        for (const [tag, source, status] of [
            ["missing-card", {}, 404],
            ["invalid-card", { "assets/card.png": btoa("<script>fetch('/mutation')</script>") }, 415],
        ] as const) {
            await importBlocArtifact(cms, {
                tag,
                name: "Card",
                compositionHTML: "<article></article>",
                thumbnail: { path: "assets/card.png" },
                source,
            });
            const response = await getBlocThumbnail(new Request(`http://localhost/api/bloc/thumbnail?id=${tag}`), cms);
            expect(response.status).toBe(status);
            expect(response.headers.get("cache-control")).toBe("private, no-store");
            expect(response.headers.get("content-type")).not.toBe("image/png");
        }
    });

    test("preserves optional cover metadata and rejects external, traversing or unsupported image references", () => {
        const cover = { path: "assets/covers/collection.webp", alt: "Collection overview" };
        const definition = parseIntegrationDefinition({ kind: "example", label: "Example", inputs: [], cover });
        expect(definition.cover).toEqual(cover);
        expect(parsePresentationImage(undefined)).toBeUndefined();
        for (const path of [
            "../cover.png",
            "assets/../cover.png",
            "assets\\cover.png",
            "https://example.test/image.png",
            "assets/%2e%2e/cover.png",
            "assets/cover.html",
        ]) {
            expect(() => parsePresentationImage({ path })).toThrow();
            expect(() =>
                parseIntegrationDefinition({ kind: "example", label: "Example", inputs: [], cover: { path } }),
            ).toThrow();
        }
        expect(() => parsePresentationImage({ path: "assets/cover.png", alt: 42 })).toThrow();
    });
});
