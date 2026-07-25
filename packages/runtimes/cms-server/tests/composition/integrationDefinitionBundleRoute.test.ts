import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { RepositoryCms } from "@bernouy/cms-repository";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

test("repository HTTP routes publish assembled filesystem definition bundles", async () => {
    const root = await createDefinitionBundle();
    try {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: new FsIntegrationDefinitionRepository(root),
        });

        const response = await runner.handle("/api/integrations/definition?kind=demo");
        const definition = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(definition).toEqual({
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            description: "Assembled over HTTP",
            inputs: [{ name: "title", label: "Title", type: "text" }],
        });
        expect(JSON.stringify(definition)).not.toContain("$include");
        expect(JSON.stringify(definition)).not.toContain("$files");
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

async function createDefinitionBundle(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-repository-bundle-"));
    const packageRoot = join(root, "demo");
    const versionRoot = join(packageRoot, "versions/1.0.0");
    await mkdir(join(versionRoot, "definitions/metadata"), { recursive: true });
    await mkdir(join(versionRoot, "definitions/inputs"), { recursive: true });
    await Promise.all([
        writeJson(join(packageRoot, "integration.json"), {
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        }),
        writeJson(join(versionRoot, "definition.json"), {
            schema: "cms.integration.definition.bundle.v1",
            root: "definitions/root.json",
        }),
        writeJson(join(versionRoot, "definitions/root.json"), {
            schema: "cms.integration.definition.v1",
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            description: { $include: "metadata/description.json" },
            inputs: { $files: ["inputs/title.json"] },
        }),
        writeJson(join(versionRoot, "definitions/metadata/description.json"), "Assembled over HTTP"),
        writeJson(join(versionRoot, "definitions/inputs/title.json"), {
            name: "title",
            label: "Title",
            type: "text",
        }),
    ]);
    return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFile(path, `${JSON.stringify(value, null, 4)}\n`);
}

class TestRunner implements Partial<Runner> {
    readonly basePath = "/";
    private readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.addEndpoint("GET", path, handler);
    }

    addEndpoint(method: string, path: string, handler: RouteHandler): void {
        this.routes.set(`${method} ${path}`, handler);
    }

    async handle(path: string, init: RequestInit = {}): Promise<Response> {
        const pathname = new URL(path, "http://localhost").pathname;
        const method = init.method ?? "GET";
        const handler = this.routes.get(`${method} ${pathname}`);
        if (!handler) {
            throw new Error(`missing handler for ${method} ${pathname}`);
        }
        return handler(new Request(`http://localhost${path}`, init)) as Promise<Response>;
    }
}
