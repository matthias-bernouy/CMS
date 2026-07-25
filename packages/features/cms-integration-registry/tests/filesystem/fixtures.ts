import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export type IntegrationFixtureOptions = {
    kind?: string;
    versions?: string[];
    stable?: string;
    latest?: string;
    transformIndex?(index: Record<string, unknown>): void;
};

export function writeIntegrationFixture(
    repositoryRoot: string,
    relativeRoot: string,
    options: IntegrationFixtureOptions = {},
): string {
    const integrationRoot = join(repositoryRoot, relativeRoot);
    const kind = options.kind ?? basename(integrationRoot);
    const versions = options.versions ?? ["1.0.0"];
    mkdirSync(integrationRoot, { recursive: true });
    const index: Record<string, unknown> = {
        schema: "cms.integration.index.v1",
        kind,
        label: `Integration ${kind}`,
        stable: options.stable ?? versions[0],
        latest: options.latest ?? versions.at(-1),
        versions: versions.map((version) => ({
            version,
            path: `versions/${version}`,
            definition: `versions/${version}/definition.json`,
        })),
    };
    options.transformIndex?.(index);
    writeJson(join(integrationRoot, "integration.json"), index);
    for (const version of new Set(versions)) {
        const versionRoot = join(integrationRoot, "versions", version);
        mkdirSync(join(versionRoot, "assets"), { recursive: true });
        writeJson(join(versionRoot, "definition.json"), {
            schema: "cms.integration.definition.v1",
            kind,
            label: `Integration ${kind}`,
            version,
            icon: { path: "assets/icon.svg" },
            inputs: [],
        });
        writeFileSync(join(versionRoot, "README.md"), `# ${kind} ${version}\n`);
        writeFileSync(join(versionRoot, "assets", "icon.svg"), `<svg data-version="${version}"/>`);
    }
    return integrationRoot;
}

export function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);
}
