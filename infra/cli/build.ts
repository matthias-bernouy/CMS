import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sourceStackRelease } from "@bernouy/ulvia-cli/stack-release-build";
import { CLI_DOCUMENTATION, writeCliDocumentation } from "./documentation";
import { verifyCli } from "./verification";

const PACKAGE_NAME = "@cyaxis/ulvia";
const NPM_REGISTRY = "https://registry.npmjs.org/";
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const root = resolve(import.meta.dir, "../..");
const source = join(root, "packages/runtimes/ulvia-cli");
const artifacts = join(root, "artifacts/cli");
const staging = join(artifacts, "package");

const [action, ...args] = Bun.argv.slice(2);
const { version, stackVersion } = parseArguments(action, args);
const archiveName = `cyaxis-ulvia-${version}.tgz`;
const archive = join(artifacts, archiveName);
const receipt = join(artifacts, `cyaxis-ulvia-${version}.json`);

if (action === "build") {
    if (!stackVersion) {
        throw new Error(usage());
    }
    await build(version, stackVersion);
} else {
    throw new Error(usage());
}

async function build(releaseVersion: string, defaultStackVersion: string): Promise<void> {
    if (releaseVersion !== defaultStackVersion) {
        throw new Error("CLI and stack releases must use the same distribution version");
    }
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
    const stackRelease = await sourceStackRelease(defaultStackVersion);
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
            __ULVIA_DEFAULT_STACK_VERSION__: JSON.stringify(defaultStackVersion),
            __ULVIA_STACK_RELEASE__: JSON.stringify(stackRelease),
        },
    });
    if (!result.success) {
        throw new AggregateError(result.logs, "CLI bundle failed");
    }
    await cp(join(source, "src/runtime/stack/orchestration/definitions"), join(staging, "dist/definitions"), {
        recursive: true,
    });
    const revision = (await command(["git", "rev-parse", "HEAD"], root, false)).trim();
    await Promise.all([
        writeCliDocumentation(root, staging, revision),
        writeFile(join(staging, "dist/stack-release.json"), JSON.stringify(stackRelease)),
        cp(join(root, "LICENSE"), join(staging, "LICENSE")),
        writeFile(join(staging, "package.json"), `${JSON.stringify(packageManifest(releaseVersion), null, 4)}\n`),
        chmod(join(staging, "dist/index.js"), 0o755),
    ]);
    await command(["bun", "install", "--production", "--ignore-scripts"], staging);
    await verifyCli(staging, releaseVersion, defaultStackVersion);
    await mkdir(artifacts, { recursive: true });
    await command(["bun", "pm", "pack", "--filename", archiveName], staging);
    await rm(archive, { force: true });
    await rename(join(staging, archiveName), archive);
    await writeFile(
        receipt,
        `${JSON.stringify({ schema: "ulvia.cli-release.v1", package: PACKAGE_NAME, version: releaseVersion, stackVersion: defaultStackVersion, revision, archive: archiveName, sha256: await sha256(archive) }, null, 4)}\n`,
    );
    console.log(`Built ${PACKAGE_NAME}@${releaseVersion} (initial stack ${defaultStackVersion}): ${archive}`);
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

function parseArguments(
    action: string | undefined,
    args: readonly string[],
): { version: string; stackVersion?: string } {
    const version = option(args, "--version");
    const stackVersion = option(args, "--stack-version");
    const expectedLength = 4;
    if (
        !version ||
        !VERSION.test(version) ||
        args.length !== expectedLength ||
        (action === "build" && (!stackVersion || !VERSION.test(stackVersion))) ||
        action !== "build"
    ) {
        throw new Error(usage());
    }
    return { version, stackVersion };
}

function option(args: readonly string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0 || args.lastIndexOf(name) !== index) {
        return undefined;
    }
    return args[index + 1];
}

async function sha256(path: string): Promise<string> {
    return createHash("sha256")
        .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
        .digest("hex");
}

async function command(args: readonly string[], cwd: string, inherit = true): Promise<string> {
    const process = Bun.spawn([...args], {
        cwd,
        stdin: inherit ? "inherit" : "ignore",
        stdout: inherit ? "inherit" : "pipe",
        stderr: "inherit",
    });
    const [exitCode, output] = await Promise.all([
        process.exited,
        inherit ? Promise.resolve("") : new Response(process.stdout).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`${args[0]} failed with exit code ${exitCode}`);
    }
    return output;
}

function usage(): string {
    return `Usage:
  bun run infra/cli/build.ts build --version <cli-version> --stack-version <stack-version>
  Publication is owned by bun run publish --version <version>.`;
}
