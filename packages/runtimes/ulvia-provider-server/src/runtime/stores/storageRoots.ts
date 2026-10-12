import { realpath, stat } from "node:fs/promises";

type StorageRoot = {
    canonicalPath: string;
    device: bigint | number;
    inode: bigint | number;
};

export async function validateCmsStorageRoots(filesDir: string): Promise<void> {
    await resolveStorageRoot(filesDir, "CMS_FILES_DIR");
}

async function resolveStorageRoot(path: string, name: string): Promise<StorageRoot> {
    try {
        const canonicalPath = await realpath(path);
        const metadata = await stat(canonicalPath, { bigint: true });
        if (!metadata.isDirectory()) {
            throw new Error("not a directory");
        }
        return { canonicalPath, device: metadata.dev, inode: metadata.ino };
    } catch (error) {
        throw new Error(`${name} must reference an existing directory`, { cause: error });
    }
}
