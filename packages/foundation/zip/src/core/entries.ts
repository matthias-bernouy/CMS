import type { Entry } from "yauzl";
import type { ZipLimits } from "zip/interfaces/zip";
import { ZipValidationError } from "./errors";

export class ZipPaths {
    private readonly seen = new Set<string>();
    private readonly files = new Set<string>();
    private readonly directories = new Set<string>();
    constructor(private readonly limits: ZipLimits) {}
    add(path: string, directory: boolean): string {
        const value = directory ? path.slice(0, -1) : path;
        const parts = value.split("/");
        if (
            !value ||
            value.normalize("NFC") !== value ||
            value.includes("\\") ||
            /[\p{Cc}\p{Cs}:]/u.test(value) ||
            parts.some((part) => !part || part === "." || part === "..")
        ) {
            throw new ZipValidationError("invalid_path", "ZIP paths must be normalized relative paths");
        }
        if (Buffer.byteLength(value) > this.limits.maxPathBytes || parts.length > this.limits.maxDepth) {
            throw new ZipValidationError("limit_exceeded", "ZIP path exceeds its limits");
        }
        if (this.seen.has(value) || (directory ? this.files.has(value) : this.directories.has(value))) {
            throw new ZipValidationError("invalid_path", "Duplicate ZIP path or file/directory collision");
        }
        for (let index = 1; index < parts.length; index++) {
            const ancestor = parts.slice(0, index).join("/");
            if (this.files.has(ancestor)) {
                throw new ZipValidationError("invalid_path", "ZIP file cannot own descendant entries");
            }
            this.directories.add(ancestor);
        }
        this.seen.add(value);
        (directory ? this.directories : this.files).add(value);
        return value;
    }
}
export function entryKind(entry: Entry): "file" | "directory" {
    const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
    const directory = entry.fileName.endsWith("/");
    if (
        entry.isEncrypted() ||
        ![0, 8].includes(entry.compressionMethod) ||
        (kind !== 0 && kind !== (directory ? 0x4000 : 0x8000))
    ) {
        throw new ZipValidationError("unsupported_entry", "ZIP encryption, links and special files are unsupported");
    }
    if (directory && (entry.uncompressedSize !== 0 || entry.crc32 !== 0)) {
        throw new ZipValidationError("invalid_archive", "ZIP directory entries must be empty");
    }
    return directory ? "directory" : "file";
}
