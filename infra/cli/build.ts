import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const PACKAGE_NAME = "@cyaxis/ulvia";
const NPM_REGISTRY = "https://registry.npmjs.org/";
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const root = resolve(import.meta.dir, "../..");
const source = join(root, "packages/runtimes/ulvia-cli");
const artifacts = join(root, "artifacts/cli");
const staging = join(artifacts, "package");
const publishing = join(artifacts, "publishing");

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
} else if (action === "publish") {
    await publish(version);
} else {
    throw new Error(usage());
}

async function build(releaseVersion: string, defaultStackVersion: string): Promise<void> {
    await rm(staging, { recursive: true, force: true });
    await mkdir(join(staging, "dist"), { recursive: true });
    const result = await Bun.build({
        entrypoints: [join(source, "src/index.ts")],
        target: "bun",
        packages: "bundle",
        external: ["css-tree"],
        outdir: join(staging, "dist"),
        naming: "index.js",
        define: {
            __ULVIA_CLI_VERSION__: JSON.stringify(releaseVersion),
            __ULVIA_DEFAULT_STACK_VERSION__: JSON.stringify(defaultStackVersion),
        },
    });
    if (!result.success) {
        throw new AggregateError(result.logs, "CLI bundle failed");
    }
    await cp(join(source, "src/runtime/stack/orchestration/definitions"), join(staging, "dist/definitions"), {
        recursive: true,
    });
    const readme = (await readFile(join(source, "README.md"), "utf8")).replace(
        "../../../docs/installation/README.md",
        "INSTALLATION.md",
    );
    await Promise.all([
        writeFile(join(staging, "README.md"), readme),
        cp(join(root, "docs/installation/README.md"), join(staging, "INSTALLATION.md")),
        cp(join(root, "LICENSE"), join(staging, "LICENSE")),
        writeFile(join(staging, "package.json"), `${JSON.stringify(packageManifest(releaseVersion), null, 4)}\n`),
        chmod(join(staging, "dist/index.js"), 0o755),
    ]);
    await command(["bun", "install", "--production", "--ignore-scripts"], staging);
    await command(["bun", "dist/index.js", "--help"], staging, false);
    const reportedVersion = (await command(["bun", "dist/index.js", "--version"], staging, false)).trim();
    if (reportedVersion !== releaseVersion) {
        throw new Error(`Built CLI reports ${reportedVersion} instead of ${releaseVersion}`);
    }
    const startHelp = await command(["bun", "dist/index.js", "services", "start", "--help"], staging, false);
    if (!startHelp.includes(`Bundled initial stack version: ${defaultStackVersion}`)) {
        throw new Error(`Built CLI does not report its ${defaultStackVersion} initial stack version`);
    }
    await mkdir(artifacts, { recursive: true });
    await command(["bun", "pm", "pack", "--filename", archiveName], staging);
    await rm(archive, { force: true });
    await rename(join(staging, archiveName), archive);
    const revision = (await command(["git", "rev-parse", "HEAD"], root, false)).trim();
    await writeFile(
        receipt,
        `${JSON.stringify({ schema: "ulvia.cli-release.v2", package: PACKAGE_NAME, version: releaseVersion, stackVersion: defaultStackVersion, revision, archive: archiveName, sha256: await sha256(archive) }, null, 4)}\n`,
    );
    console.log(`Built ${PACKAGE_NAME}@${releaseVersion} (initial stack ${defaultStackVersion}): ${archive}`);
}

async function publish(releaseVersion: string): Promise<void> {
    const value = JSON.parse(await readFile(receipt, "utf8")) as Record<string, unknown>;
    if (
        value.schema !== "ulvia.cli-release.v2" ||
        value.package !== PACKAGE_NAME ||
        value.version !== releaseVersion ||
        typeof value.stackVersion !== "string" ||
        !VERSION.test(value.stackVersion) ||
        value.archive !== archiveName ||
        value.sha256 !== (await sha256(archive))
    ) {
        throw new Error(`Refusing invalid CLI release artifact for ${PACKAGE_NAME}@${releaseVersion}`);
    }
    await rm(publishing, { recursive: true, force: true });
    await mkdir(publishing, { recursive: true });
    await command(["tar", "-xzf", archive, "--strip-components=1", "-C", publishing], root);
    const tag = releaseVersion.includes("-") ? "next" : "latest";
    await command(["bun", "publish", "--registry", NPM_REGISTRY, "--access", "public", "--tag", tag], publishing);
}

function packageManifest(releaseVersion: string): Record<string, unknown> {
    return {
        name: PACKAGE_NAME,
        version: releaseVersion,
        description: "Ulvia CMS installation and release CLI.",
        license: "MIT",
        type: "module",
        bin: { ulvia: "dist/index.js" },
        files: ["dist/", "README.md", "INSTALLATION.md", "LICENSE"],
        engines: { bun: ">=1.4.2" },
        dependencies: { "css-tree": "3.2.1" },
        publishConfig: { access: "public", registry: NPM_REGISTRY },
    };
}

function parseArguments(
    action: string | undefined,
    args: readonly string[],
): { version: string; stackVersion?: string } {
    const version = option(args, "--version");
    const stackVersion = option(args, "--stack-version");
    const expectedLength = action === "build" ? 4 : 2;
    if (
        !version ||
        !VERSION.test(version) ||
        args.length !== expectedLength ||
        (action === "build" && (!stackVersion || !VERSION.test(stackVersion))) ||
        (action === "publish" && stackVersion)
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
  bun run infra/cli/build.ts publish --version <cli-version>`;
}
