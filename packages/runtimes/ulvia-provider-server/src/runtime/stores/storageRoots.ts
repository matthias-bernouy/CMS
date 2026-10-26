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

export function instanceDatabaseName(storageKey: string): string {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(storageKey)) {
        throw new TypeError("Provider instance storage key is invalid");
    }
    return `ulvia_${storageKey.replaceAll("-", "_")}`;
}
export function instanceMongoUrl(controlUrl: string, storageKey: string): string {
    const url = new URL(controlUrl);
    url.pathname = `/${instanceDatabaseName(storageKey)}`;
    return url.toString();
}
