import type {
    RepositoryAssetDownloadSink,
    RepositoryDownloadAsset,
} from "@bernouy/cms-repository/repository/publication";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export class RemoteAssetFileSink implements RepositoryAssetDownloadSink {
    private readonly root: string;

    constructor(repositoryRoot: string) {
        this.root = join(repositoryRoot, ".remote-transfers");
    }

    async get(asset: RepositoryDownloadAsset): Promise<Blob | null> {
        const path = this.path(asset);
        const metadata = await stat(path).catch(() => null);
        return metadata?.isFile() && metadata.size === asset.byteLength ? Bun.file(path) : null;
    }

    async store(asset: RepositoryDownloadAsset, body: ReadableStream<Uint8Array>): Promise<Blob> {
        await mkdir(this.root, { recursive: true });
        const path = this.path(asset);
        const temporary = `${path}.${crypto.randomUUID()}.tmp`;
        const handle = await open(temporary, "wx", 0o600);
        const reader = body.getReader();
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done) {
                    break;
                }
                await writeAll(handle, part.value);
            }
            await handle.sync();
        } catch (error) {
            await rm(temporary, { force: true });
            throw error;
        } finally {
            reader.releaseLock();
            await handle.close();
        }
        await rename(temporary, path);
        return Bun.file(path);
    }

    async complete(): Promise<void> {
        await rm(this.root, { recursive: true, force: true });
    }

    private path(asset: RepositoryDownloadAsset): string {
        return join(this.root, asset.digest.slice("sha256:".length));
    }
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.byteLength) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset);
        offset += bytesWritten;
    }
}
