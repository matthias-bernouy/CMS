import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const LEGACY_COMMERCE_EDGE_COMMIT = "fa3b7472bfd2c0b04d422f0c3e0cb13ecf691142";

const edgeRoot =
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/" +
    "connectors/supabase/functions/cms-commerce";

export type LegacyCommerceHandler = (request: Request) => Promise<Response>;

export async function loadLegacyCommerceArtifact(): Promise<{
    cleanup: () => Promise<void>;
    handler: LegacyCommerceHandler;
}> {
    const repositoryRoot = await commandText(["git", "rev-parse", "--show-toplevel"], import.meta.dir);
    const artifactRoot = await mkdtemp(join(tmpdir(), "cms-commerce-legacy-edge-"));
    try {
        const archivePath = join(artifactRoot, "artifact.tar");
        const archive = await commandBytes(
            ["git", "archive", "--format=tar", LEGACY_COMMERCE_EDGE_COMMIT, edgeRoot],
            repositoryRoot,
        );
        await writeFile(archivePath, archive);
        await commandText(["tar", "-xf", archivePath, "-C", artifactRoot], repositoryRoot);
        const handlerPath = join(artifactRoot, edgeRoot, "handler.ts");
        const module = (await import(`${pathToFileURL(handlerPath).href}?commit=${LEGACY_COMMERCE_EDGE_COMMIT}`)) as {
            handleCommerceRequest?: unknown;
        };
        if (typeof module.handleCommerceRequest !== "function") {
            throw new Error(`Commit ${LEGACY_COMMERCE_EDGE_COMMIT} does not export handleCommerceRequest.`);
        }
        return {
            handler: module.handleCommerceRequest as LegacyCommerceHandler,
            cleanup: () => rm(artifactRoot, { force: true, recursive: true }),
        };
    } catch (error) {
        await rm(artifactRoot, { force: true, recursive: true });
        throw error;
    }
}

async function commandBytes(command: string[], cwd: string): Promise<Uint8Array> {
    const process = Bun.spawn(command, { cwd, stderr: "pipe", stdout: "pipe" });
    const [bytes, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).bytes(),
        new Response(process.stderr).text(),
        process.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
    }
    return bytes;
}

async function commandText(command: string[], cwd: string): Promise<string> {
    return new TextDecoder().decode(await commandBytes(command, cwd)).trim();
}
