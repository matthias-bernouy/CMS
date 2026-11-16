import { fileHash } from "./files";
import { command } from "../process";

const REGISTRY = "https://registry.npmjs.org/";
export type NpmTransport = {
    fetch: (url: string, options: RequestInit) => Promise<Response>;
    run: (args: readonly string[]) => Promise<unknown>;
};

/** Probe exact archive integrity before publication, including retries after an uncertain response. */
export async function prepareNpmPublication(
    archive: string,
    version: string,
    transport: NpmTransport = { fetch, run: command },
): Promise<() => Promise<void>> {
    const integrity = `sha512-${await fileHash(archive, "sha512", "base64")}`;
    const url = `${REGISTRY}@cyaxis%2Fulvia/${version}`;
    async function exists(): Promise<boolean> {
        const response = await transport.fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
        if (response.status === 404) {
            await response.body?.cancel();
            return false;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`npm preflight failed (${response.status})`);
        }
        const metadata = (await boundedMetadata(response)) as {
            name?: string;
            version?: string;
            dist?: { integrity?: string };
        };
        if (
            metadata.name !== "@cyaxis/ulvia" ||
            metadata.version !== version ||
            metadata.dist?.integrity !== integrity
        ) {
            throw new Error(`npm version ${version} already exists with different bytes`);
        }
        return true;
    }
    const published = await exists();
    return async () => {
        if (published) {
            return;
        }
        await transport.run([
            "bun",
            "publish",
            archive,
            "--registry",
            REGISTRY,
            "--access",
            "public",
            "--tag",
            version.includes("-") ? "next" : "latest",
            "--ignore-scripts",
        ]);
        if (!(await exists())) {
            throw new Error("npm publication is not visible yet; retry the same distribution");
        }
    };
}

async function boundedMetadata(response: Response): Promise<unknown> {
    if (!response.body) {
        throw new Error("Missing npm metadata response");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.byteLength;
            if (size > 1_048_576) {
                throw new Error("npm metadata exceeds 1 MiB");
            }
            chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
