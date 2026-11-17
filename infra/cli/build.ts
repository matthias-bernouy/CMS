import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sourceStackRelease } from "@bernouy/ulvia-cli/stack-release-build";
import { CLI_DOCUMENTATION, writeCliDocumentation } from "./documentation";
import { verifyCli } from "./verification";
import { command } from "../process";
import { fileHash } from "../distribution/files";
import { distributionRoot, versionArgument } from "../distribution/options";

const PACKAGE_NAME = "@cyaxis/ulvia";
const NPM_REGISTRY = "https://registry.npmjs.org/";
const root = resolve(import.meta.dir, "../..");
const source = join(root, "packages/runtimes/ulvia-cli");
const staging = join(root, "artifacts/cli/package");

const [action, ...args] = Bun.argv.slice(2);
if (action !== "build") {
    throw new Error(usage());
}
const version = versionArgument(args, usage());
const artifacts = join(distributionRoot(root, version), "cli");
const archiveName = `cyaxis-ulvia-${version}.tgz`;
const archive = join(artifacts, archiveName);
const receipt = join(artifacts, `cyaxis-ulvia-${version}.json`);

await build(version);

async function build(releaseVersion: string): Promise<void> {
    await rm(staging, { recursive: true, force: true });
    await mkdir(join(staging, "dist"), { recursive: true });
    const previewRuntimes = {
        blocRuntime: await readFile(
            join(root, "packages/features/content/dist/runtime-assets/bloc-runtime.js"),
            "utf8",
        ),
        bindingCore: await readFile(
            join(root, "packages/features/content/dist/runtime-assets/binding-core.js"),
            "utf8",
        ),
    };
    const stackRelease = await sourceStackRelease(releaseVersion);
    const result = await Bun.build({
        entrypoints: [join(source, "src/index.ts")],
        target: "bun",
        packages: "bundle",
        external: ["css-tree", "playwright"],
        outdir: join(staging, "dist"),
        naming: "index.js",
        define: {
            __ULVIA_PREVIEW_RUNTIMES__: JSON.stringify(previewRuntimes),
            __ULVIA_CLI_VERSION__: JSON.stringify(releaseVersion),
            __ULVIA_DEFAULT_STACK_VERSION__: JSON.stringify(releaseVersion),
            __ULVIA_STACK_RELEASE__: JSON.stringify(stackRelease),
        },
    });
    if (!result.success) {
        throw new AggregateError(result.logs, "CLI bundle failed");
    }
    await cp(join(source, "src/runtime/stack/orchestration/definitions"), join(staging, "dist/definitions"), {
        recursive: true,
    });
    const revision = (await command(["git", "rev-parse", "HEAD"], { cwd: root, capture: true })).trim();
    await Promise.all([
        writeCliDocumentation(root, staging, revision),
        writeFile(join(staging, "dist/stack-release.json"), JSON.stringify(stackRelease)),
        cp(join(root, "LICENSE"), join(staging, "LICENSE")),
        writeFile(join(staging, "package.json"), `${JSON.stringify(packageManifest(releaseVersion), null, 4)}\n`),
        chmod(join(staging, "dist/index.js"), 0o755),
    ]);
    await command(["bun", "install", "--production", "--ignore-scripts"], { cwd: staging });
    await verifyCli(staging, releaseVersion);
    await mkdir(artifacts, { recursive: true });
    await command(["bun", "pm", "pack", "--filename", archiveName], { cwd: staging });
    await rm(archive, { force: true });
    await rename(join(staging, archiveName), archive);
    await writeFile(
        receipt,
        `${JSON.stringify({ package: PACKAGE_NAME, version: releaseVersion, stackVersion: releaseVersion, revision, archive: archiveName, sha256: await fileHash(archive) }, null, 4)}\n`,
    );
    console.log(`Built ${PACKAGE_NAME}@${releaseVersion} (initial stack ${releaseVersion}): ${archive}`);
}

function packageManifest(releaseVersion: string): Record<string, unknown> {
    return {
        name: PACKAGE_NAME,
        version: releaseVersion,
        description: "Ulvia CMS installation and release CLI.",
        license: "MIT",
        type: "module",
        bin: { ulvia: "dist/index.js" },
        files: ["dist/", ...CLI_DOCUMENTATION.map(({ target }) => target), "LICENSE"],
        engines: { bun: ">=1.4.4" },
        dependencies: { "css-tree": "3.2.1", playwright: "1.64.1" },
        publishConfig: { access: "public", registry: NPM_REGISTRY },
    };
}

function usage(): string {
    return "Usage: bun run infra/cli/build.ts build --version <version>";
}
