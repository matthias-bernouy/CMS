import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

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
        writeJson(join(integrationRoot, "integration.json"), {
            kind: "composition-pack",
            label: "Composition Pack",
            stable: "1.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        });
        writeJson(join(versionRoot, "definition.json"), {
            kind: "composition-pack",
            label: "Composition Pack",
            version: "1.0.0",
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

        const artifact = (await new FsIntegrationDefinitionRepository(root).get("composition-pack"))?.artifacts?.[0];

        expect(artifact?.type).toBe("bloc");
        if (artifact?.type !== "bloc") {
            throw new Error("expected composition artifact");
        }
        expect(artifact.bloc.viewJS).toBeUndefined();
        expect(artifact.bloc.compositionHTML).toBe("<header>Brand</header><slot></slot>");
        expect(artifact.bloc.editorJS).toContain("SiteShellEditor");
        expect(artifact.bloc.source?.["template.html"]).toBeTruthy();
    });
});
