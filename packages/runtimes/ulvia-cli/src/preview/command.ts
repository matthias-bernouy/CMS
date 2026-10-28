import { serveExampleFiles } from "./server";
import { mkdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import {
    prepareCollectionRelease,
    renderCollectionExamples,
    type CollectionExampleRuntimes,
} from "@bernouy/cms-repository/collections/build";
import {
    LocalArtifactFiles,
    LocalContractReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import { CMS_BROWSER_RUNTIME_ABI } from "@bernouy/cms-content/runtime-abi";
import { exampleExplorer } from "./explorer";
import { captureCollectionExamples } from "./capture";

declare const __ULVIA_PREVIEW_RUNTIMES__: CollectionExampleRuntimes | undefined;

const HELP =
    "Usage: ulvia preview <collection-directory> --output <new-directory> [--dependency <collection-directory>] [--locale <locale>] [--theme-mode <light|dark>] [--no-screenshots] [--serve]";

export async function previewCommand(
    args: readonly string[],
    cwd: string,
    repositoryRoot: string,
    log: (message: string) => void,
): Promise<void> {
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(HELP);
        return;
    }
    const directory = args[0];
    const dependencies: string[] = [];
    let output: string | undefined;
    let locale: string | undefined;
    let themeMode: "light" | "dark" | undefined;
    let screenshots = true;
    let serve = false;
    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--serve") {
            serve = true;
        } else if (args[i] === "--no-screenshots") {
            screenshots = false;
        } else if (args[i] === "--locale" && args[i + 1] && !args[i + 1]!.startsWith("-") && locale === undefined) {
            locale = args[++i];
        } else if (args[i] === "--theme-mode" && args[i + 1] && themeMode === undefined) {
            const value = args[++i];
            if (value !== "light" && value !== "dark") {
                throw new Error(HELP);
            }
            themeMode = value;
        } else if (["--output", "--dependency"].includes(args[i]!) && args[i + 1] && !args[i + 1]!.startsWith("-")) {
            const value = resolve(cwd, args[++i]!);
            if (args[i - 1] === "--dependency") {
                dependencies.push(value);
            } else if (output === undefined) {
                output = value;
            } else {
                throw new Error(HELP);
            }
        } else {
            throw new Error(HELP);
        }
    }
    if (!directory || directory.startsWith("-") || !output || dependencies.length > 128) {
        throw new Error(HELP);
    }
    const source = resolve(cwd, directory);
    if (!relative(source, output).startsWith("..") || !relative(output, source).startsWith("..")) {
        throw new Error("Preview output must be separate from authored sources");
    }
    const contracts = await new LocalContractReleases(
        new LocalArtifactFiles(repositoryRoot),
        new LocalRepositoryYanks(repositoryRoot),
    ).catalogue();
    const artifact = await prepareCollectionRelease(source, contracts);
    const admittedDependencies = [];
    for (const dependency of dependencies) {
        admittedDependencies.push(await prepareCollectionRelease(dependency, contracts));
    }
    const exported = await renderCollectionExamples(
        artifact,
        admittedDependencies,
        typeof __ULVIA_PREVIEW_RUNTIMES__ === "undefined" ? undefined : __ULVIA_PREVIEW_RUNTIMES__,
        { locale, themeMode },
    );
    if (exported.frames.length === 0) {
        throw new Error("This collection has no published examples");
    }
    const files = new Map([...exported.files, ...exampleExplorer(exported.frames)]);
    await mkdir(output);
    for (const [path, bytes] of files) {
        const target = join(output, path);
        await mkdir(resolve(target, ".."), { recursive: true });
        await Bun.write(target, bytes);
    }
    const captures = screenshots ? await captureCollectionExamples(files, exported.frames, output) : [];
    const manifest = {
        protocol: "ulvia-example-export/v1",
        release: {
            publisherId: artifact.release.publisherId,
            collectionId: artifact.release.collectionId,
            version: artifact.release.version,
            digest: artifact.digest,
        },
        dependencies: admittedDependencies.map(({ release, digest }) => ({
            publisherId: release.publisherId,
            collectionId: release.collectionId,
            version: release.version,
            digest,
        })),
        browserAbi: CMS_BROWSER_RUNTIME_ABI,
        files: await Promise.all(
            [...files].map(async ([path, bytes]) => ({
                path,
                byteLength: bytes.size,
                digest: `sha256:${new Bun.CryptoHasher("sha256").update(await bytes.arrayBuffer()).digest("hex")}`,
            })),
        ),
        frames: exported.frames,
        captures,
        blocPreviews: artifact.release.blocs.flatMap((bloc) => {
            const frame = exported.frames.find((item) => item.exampleId === bloc.defaultExample);
            return frame
                ? [
                      {
                          blocId: bloc.id,
                          exampleId: frame.exampleId,
                          previewId: frame.previewId,
                          path: frame.path,
                          ...(captures.some((capture) => capture.path === frame.path.replace(/\.html$/, ".png"))
                              ? { capturePath: frame.path.replace(/\.html$/, ".png") }
                              : {}),
                      },
                  ]
                : [];
        }),
    };
    await Bun.write(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
    log(`Exported ${exported.frames.length} example frames to ${output}`);
    if (serve) {
        const server = serveExampleFiles(files);
        log(`Local example explorer: ${server.url.href}`);
    }
}
