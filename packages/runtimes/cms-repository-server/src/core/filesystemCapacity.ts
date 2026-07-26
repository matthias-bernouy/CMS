import { statfs } from "node:fs/promises";

export type RepositoryFilesystemCapacity =
    | Readonly<{
          status: "available";
          checkedAt: string;
          totalBytes: string;
          freeBytes: string;
          availableBytes: string;
          usedBytes: string;
          usedBasisPoints: number;
      }>
    | Readonly<{
          status: "unavailable";
          checkedAt: string;
      }>;

type FilesystemBlocks = Readonly<{
    bsize: bigint;
    blocks: bigint;
    bfree: bigint;
    bavail: bigint;
}>;

export async function readRepositoryFilesystemCapacity(
    root: string,
    options: Readonly<{
        read?: (path: string) => Promise<FilesystemBlocks>;
        now?: () => Date;
    }> = {},
): Promise<RepositoryFilesystemCapacity> {
    const checkedAt = (options.now ?? (() => new Date()))().toISOString();
    try {
        const blocks = await (options.read ?? readFilesystemBlocks)(root);
        const blockSize = nonNegative(blocks.bsize);
        const totalBytes = nonNegative(blocks.blocks) * blockSize;
        const freeBytes = minimum(nonNegative(blocks.bfree) * blockSize, totalBytes);
        const availableBytes = minimum(nonNegative(blocks.bavail) * blockSize, freeBytes);
        const usedBytes = totalBytes - freeBytes;
        return {
            status: "available",
            checkedAt,
            totalBytes: totalBytes.toString(),
            freeBytes: freeBytes.toString(),
            availableBytes: availableBytes.toString(),
            usedBytes: usedBytes.toString(),
            usedBasisPoints: totalBytes === 0n ? 0 : Number((usedBytes * 10_000n) / totalBytes),
        };
    } catch {
        return { status: "unavailable", checkedAt };
    }
}

async function readFilesystemBlocks(path: string): Promise<FilesystemBlocks> {
    return await statfs(path, { bigint: true });
}

function nonNegative(value: bigint): bigint {
    if (typeof value !== "bigint") {
        throw new TypeError("Filesystem capacity values must be bigint");
    }
    return value < 0n ? 0n : value;
}

function minimum(value: bigint, maximum: bigint): bigint {
    return value < maximum ? value : maximum;
}
