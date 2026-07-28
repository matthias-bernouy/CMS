import { joinWithin } from "../../filesystem";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function verificationObjectRelativePath(digest: string): string {
    if (!SHA256_PATTERN.test(digest)) {
        throw new Error("Official verification object digest must be a lowercase SHA-256 digest");
    }
    return `.registry/verification/objects/sha256/${quartet(digest[0]!)}/${quartet(digest[1]!)}/${digest}.json`;
}

export function verificationObjectPath(root: string, digest: string): string {
    return joinWithin(root, verificationObjectRelativePath(digest));
}

function quartet(nibble: string): string {
    const value = Number.parseInt(nibble, 16);
    const first = Math.floor(value / 4) * 4;
    return `${first.toString(16)}-${(first + 3).toString(16)}`;
}
