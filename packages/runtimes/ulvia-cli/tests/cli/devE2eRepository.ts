import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import { LocalIntegrationRepository } from "../../src/repository/local";
import { importLocalPackageSeed } from "../../src/repository/seed";
import { readLocalReleaseSource } from "../../src/release/source";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../src/runtime/paths";

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
    await mkdir(input.fixtureRoot, { recursive: true });
    await seedMondialRelayThree(input.integrations, input.fixtureRoot);
    await storeHistoricalFixture(input.integrations, input.fixtureRoot, input.data);
    await runCli(["release", "--all", "--root", input.integrations], options);
    const collectionRoot = join(input.integrations, "collections", "ulvia");
    const upgradeRoot = join(input.fixtureRoot, "ulvia");
    await cp(collectionRoot, upgradeRoot, { recursive: true });
    await writeCollectionUpgrade(upgradeRoot);
    await runCli(["release", "ulvia", "--root", input.fixtureRoot], options);
    await writeBreakingCollectionUpgrade(upgradeRoot);
    await runCli(["release", "ulvia", "--root", input.fixtureRoot], options);
}

async function storeHistoricalFixture(integrations: string, fixtureRoot: string, data: string): Promise<void> {
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: data });
    await ensureUlviaPaths(paths);
    const local = new LocalIntegrationRepository(paths.repository, paths.packages);
    await local.init();
    await importLocalPackageSeed(integrations, local);
    const source = await readLocalReleaseSource(fixtureRoot, "mondial-relay");
    await local.store({
        package: source.package,
        definition: source.definition,
        verification: source.verification,
        source: "fixture:mondial-relay@3.0.0",
    });
}

async function seedMondialRelayThree(integrations: string, fixtureRoot: string): Promise<void> {
    const source = join(integrations, "providers", "mondial-relay");
    const target = join(fixtureRoot, "mondial-relay");
    await cp(source, target, { recursive: true });
    const definitionPath = join(target, "definitions", "root.json");
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    definition.version = "3.0.0";
    const indexPath = join(target, "integration.json");
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    index.latest = "3.0.0";
    index.stable = "3.0.0";
    index.versions = [{ version: "3.0.0", path: ".", definition: "definition.json" }];
    await Promise.all([
        writeFile(definitionPath, JSON.stringify(definition, null, 4)),
        writeFile(indexPath, JSON.stringify(index, null, 4)),
        writeFile(join(target, "release-notes.txt"), "E2E compatibility fixture for Mondial Relay 3.x.\n"),
    ]);
}

async function writeCollectionUpgrade(root: string): Promise<void> {
    const definitionPath = join(root, "definitions", "root.json");
    const resourcesPath = join(root, "definitions", "configuration", "resources.json");
    const artifact = "artifacts/blocs/e2e/new-resource.json";
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    definition.version = "2.2.0";
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
    index.latest = "2.2.0";
    index.stable = "2.2.0";
    index.versions = [{ version: "2.2.0", path: ".", definition: "definition.json" }];
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
    definition.version = "3.0.0";
    definition.artifacts.$files = definition.artifacts.$files.filter(
        (path: string) => path !== "artifacts/blocs/foundation/basic-blocs/content/text/basic-paragraph.json",
    );
    const resources = JSON.parse(await readFile(resourcesPath, "utf8")).filter(
        (resource: { id: string }) => resource.id !== "ulvia/blocs/p",
    );
    const index = JSON.parse(await readFile(join(root, "integration.json"), "utf8"));
    index.latest = "3.0.0";
    index.stable = "3.0.0";
    index.versions = [{ version: "3.0.0", path: ".", definition: "definition.json" }];
    await Promise.all([
        writeFile(definitionPath, JSON.stringify(definition, null, 4)),
        writeFile(resourcesPath, JSON.stringify(resources, null, 4)),
        writeFile(join(root, "integration.json"), JSON.stringify(index, null, 4)),
        writeFile(join(root, "release-notes.txt"), "Remove an active E2E collection resource.\n"),
    ]);
}
