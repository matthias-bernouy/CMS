import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

type StorageRoot = {
    canonicalPath: string;
    device: bigint | number;
    inode: bigint | number;
};

export async function validateCmsStorageRoots(filesDir: string, packageCacheDir: string): Promise<void> {
    const [files, packages] = await Promise.all([
        resolveStorageRoot(filesDir, "CMS_FILES_DIR"),
        resolveStorageRoot(packageCacheDir, "CMS_INTEGRATION_PACKAGE_CACHE_DIR"),
    ]);
    if (files.device === packages.device && files.inode === packages.inode) {
        throw new Error("CMS_FILES_DIR and CMS_INTEGRATION_PACKAGE_CACHE_DIR must reference distinct directories");
    }
    if (containsPath(files.canonicalPath, packages.canonicalPath)) {
        throw new Error("CMS_INTEGRATION_PACKAGE_CACHE_DIR must not be inside CMS_FILES_DIR");
    }
    if (containsPath(packages.canonicalPath, files.canonicalPath)) {
        throw new Error("CMS_FILES_DIR must not be inside CMS_INTEGRATION_PACKAGE_CACHE_DIR");
    }
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

function containsPath(parent: string, candidate: string): boolean {
    const suffix = relative(parent, candidate);
    return suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}
