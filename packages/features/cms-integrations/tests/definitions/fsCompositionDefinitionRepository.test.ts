import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, JSON.stringify(value, null, 4) + "\n");
}

describe("FsIntegrationDefinitionRepository compositions", () => {
    test("hydrates a template without requiring a Bloc.ts view", async () => {
        const root = mkdtempSync(join(tmpdir(), "cms-integrations-"));
        const integrationRoot = join(root, "composition-pack");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        const blocRoot = join(versionRoot, "blocs", "site-shell");
        mkdirSync(blocRoot, { recursive: true });
        mkdirSync(join(versionRoot, "assets"));
        const cover = { path: "assets/cover.svg", alt: "Collection cover" };
        const thumbnail = { path: "assets/card.svg", alt: "Card thumbnail" };
        const image = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>';
        writeFileSync(join(versionRoot, cover.path), image);
        writeFileSync(join(versionRoot, thumbnail.path), image);
        writeJson(join(blocRoot, "manifest.json"), { thumbnail });
        writeJson(join(integrationRoot, "integration.json"), {
            kind: "composition-pack",
            label: "Composition Pack",
            cover,
            stable: "1.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        });
        writeJson(join(versionRoot, "definition.json"), {
            kind: "composition-pack",
            label: "Composition Pack",
            version: "1.0.0",
            cover,
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "site-shell",
                        name: "Site shell",
                        path: "blocs/site-shell",
                        composition: "template.html",
                    },
                },
            ],
        });
        writeFileSync(join(blocRoot, "template.html"), "<header>Brand</header><slot></slot>");
        writeFileSync(join(blocRoot, "BlocEditor.ts"), "export class SiteShellEditor {}");

        const repository = new FsIntegrationDefinitionRepository(root);
        const definition = await repository.get("composition-pack");
        const artifact = definition?.artifacts?.[0];
        expect(definition?.cover).toEqual(cover);
        expect((await repository.getIndex("composition-pack"))?.cover).toEqual(cover);
        expect((await repository.list())[0]?.cover).toEqual(cover);
        const remote = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repository.example.test",
            fetch: (async (input) => {
                const path = new URL(String(input)).pathname;
                return Response.json(
                    path.endsWith("/definition")
                        ? definition
                        : path.endsWith("/index")
                          ? await repository.getIndex("composition-pack")
                          : await repository.list(),
                );
            }) as typeof fetch,
        });
        expect((await remote.get("composition-pack", "1.0.0"))?.cover).toEqual(cover);
        expect((await remote.getIndex("composition-pack"))?.cover).toEqual(cover);
        expect((await remote.list())[0]?.cover).toEqual(cover);

        expect(artifact?.type).toBe("bloc");
        if (artifact?.type !== "bloc") {
            throw new Error("expected composition artifact");
        }
        expect(artifact.bloc.viewJS).toBeUndefined();
        expect(artifact.bloc.compositionHTML).toBe("<header>Brand</header><slot></slot>");
        expect(artifact.bloc.editorJS).toContain("SiteShellEditor");
        expect(artifact.bloc.source?.["template.html"]).toBeTruthy();
        expect(artifact.bloc.thumbnail).toEqual(thumbnail);
        expect(atob(artifact.bloc.source![thumbnail.path]!)).toBe(image);
    });
});
