import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";

export async function prepareDevRepository(input: {
    workspace: string;
    integrations: string;
    data: string;
    fixtureRoot: string;
}): Promise<void> {
    const options = {
        cwd: input.workspace,
        environment: { ULVIA_DATA_DIR: input.data },
        releaseVerifier: { verify: async () => undefined },
        log: () => undefined,
    };
    await runCli(["release", "--all", "--root", input.integrations], options);
    const collectionRoot = join(input.integrations, "collections", "ulvia");
    const upgradeRoot = join(input.fixtureRoot, "ulvia");
    await mkdir(input.fixtureRoot, { recursive: true });
    await cp(collectionRoot, upgradeRoot, { recursive: true });
    await writeCollectionUpgrade(upgradeRoot);
    await runCli(["release", "ulvia", "--root", input.fixtureRoot], options);
    await writeBreakingCollectionUpgrade(upgradeRoot);
    await runCli(["release", "ulvia", "--root", input.fixtureRoot], options);
}

async function writeCollectionUpgrade(root: string): Promise<void> {
    const definitionPath = join(root, "definitions", "root.json");
    const resourcesPath = join(root, "definitions", "configuration", "resources.json");
    const artifact = "artifacts/blocs/e2e/new-resource.json";
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    definition.version = "1.1.0";
    definition.artifacts.$files.push(artifact);
    const resources = JSON.parse(await readFile(resourcesPath, "utf8"));
    resources.push({
        id: "ulvia/blocs/e2e-new-resource",
        type: "bloc",
        artifact: "ulvia-e2e-new-resource",
        category: "text",
        defaultActive: true,
    });
    const index = JSON.parse(await readFile(join(root, "integration.json"), "utf8"));
    index.latest = "1.1.0";
    index.stable = "1.1.0";
    index.versions = [{ version: "1.1.0", path: ".", definition: "definition.json" }];
    await mkdir(join(root, "definitions", "artifacts", "blocs", "e2e"), { recursive: true });
    await Promise.all([
        writeFile(definitionPath, JSON.stringify(definition, null, 4)),
        writeFile(resourcesPath, JSON.stringify(resources, null, 4)),
        writeFile(join(root, "integration.json"), JSON.stringify(index, null, 4)),
        writeFile(join(root, "release-notes.txt"), "Add an E2E-only collection resource.\n"),
        writeFile(
            join(root, "definitions", artifact),
            JSON.stringify({
                type: "bloc",
                bloc: {
                    tag: "ulvia-e2e-new-resource",
                    name: "E2E new resource",
                    group: "E2E",
                    compositionHTML: "<p>New collection resource</p>",
                },
            }),
        ),
    ]);
}

async function writeBreakingCollectionUpgrade(root: string): Promise<void> {
    const definitionPath = join(root, "definitions", "root.json");
    const resourcesPath = join(root, "definitions", "configuration", "resources.json");
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    definition.version = "2.0.0";
    definition.artifacts.$files = definition.artifacts.$files.filter(
        (path: string) => path !== "artifacts/blocs/foundation/basic-blocs/content/text/basic-paragraph.json",
    );
    const resources = JSON.parse(await readFile(resourcesPath, "utf8")).filter(
        (resource: { id: string }) => resource.id !== "ulvia/blocs/p",
    );
    const index = JSON.parse(await readFile(join(root, "integration.json"), "utf8"));
    index.latest = "2.0.0";
    index.stable = "2.0.0";
    index.versions = [{ version: "2.0.0", path: ".", definition: "definition.json" }];
    await Promise.all([
        writeFile(definitionPath, JSON.stringify(definition, null, 4)),
        writeFile(resourcesPath, JSON.stringify(resources, null, 4)),
        writeFile(join(root, "integration.json"), JSON.stringify(index, null, 4)),
        writeFile(join(root, "release-notes.txt"), "Remove an active E2E collection resource.\n"),
    ]);
}
