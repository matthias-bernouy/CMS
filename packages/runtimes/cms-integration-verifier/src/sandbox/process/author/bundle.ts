import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BoundIntegrationVerificationAuthorSuiteV1 } from "@bernouy/cms-integration-verification";

const SDK_SPECIFIER = "@bernouy/cms-integration-verification/sdk/v1";
const MAX_BUNDLE_BYTES = 24 * 1_048_576;

export class AuthorSuiteBuildError extends Error {
    override readonly name = "AuthorSuiteBuildError";
}

export async function buildAuthorSuiteIife(
    suite: BoundIntegrationVerificationAuthorSuiteV1,
    tempRoot: string,
): Promise<string> {
    const root = await mkdtemp(join(tempRoot, ".cms-author-suite-"));
    try {
        const sourceRoot = join(root, "source");
        for (const source of suite.content.sources) {
            const destination = join(sourceRoot, ...source.path.split("/"));
            await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
            await writeFile(destination, source.file.content, { flag: "wx", mode: 0o600 });
        }
        const entrypoint = join(root, "entry.ts");
        const relativeEntrypoint = `./source/${suite.content.suite.entrypoint}`;
        await writeFile(
            entrypoint,
            `import suite from ${JSON.stringify(relativeEntrypoint)};\nglobalThis.__cmsAuthorSuite = suite;\n`,
            { flag: "wx", mode: 0o600 },
        );
        const sdkPath = Bun.resolveSync(SDK_SPECIFIER, import.meta.dir);
        const output = await Bun.build({
            entrypoints: [entrypoint],
            target: "browser",
            format: "iife",
            splitting: false,
            minify: false,
            sourcemap: "none",
            plugins: [
                {
                    name: "cms-author-suite-sdk-v1",
                    setup(build) {
                        build.onResolve({ filter: /^@bernouy\/cms-integration-verification\/sdk\/v1$/u }, () => ({
                            path: sdkPath,
                        }));
                    },
                },
            ],
        });
        if (!output.success || output.outputs.length !== 1) {
            throw new AuthorSuiteBuildError();
        }
        const source = await output.outputs[0]!.text();
        if (Buffer.byteLength(source) > MAX_BUNDLE_BYTES) {
            throw new AuthorSuiteBuildError();
        }
        return source;
    } catch (error) {
        if (error instanceof AuthorSuiteBuildError) {
            throw error;
        }
        throw new AuthorSuiteBuildError();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
