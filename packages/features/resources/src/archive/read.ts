import { readZip } from "@bernouy/zip";
import { isSha256Digest, sha256Digest, snapshotBinary, mediaTypeIssue } from "@bernouy/binary-media";
import { deepFreeze, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { parseInlineSvgAsset } from "@bernouy/content/page-document";
import type { ResourceArchiveOptions, VerifiedResourceArchive } from "resources/interfaces/archive";
import { resourceDocument } from "./document";
import { ResourceArchiveError } from "./errors";
import { resourceZipOptions } from "./limits";
import { resourceArchiveDigest } from "./digest";

/** Complete bounded verification, without Content writes or browser execution. */
export async function readResourceArchive(
    input: Blob | Uint8Array,
    options: ResourceArchiveOptions,
): Promise<VerifiedResourceArchive> {
    const capturedOptions = resourceZipOptions(options);
    const signal = capturedOptions.signal;
    signal?.throwIfAborted();
    const maxArchiveBytes = capturedOptions.limits.maxArchiveBytes;
    if (
        !isSha256Digest(options.expectedDigest) ||
        (input instanceof Blob ? input.size : input.byteLength) > maxArchiveBytes
    ) {
        throw new ResourceArchiveError("Resource archive exceeds its limit or has an invalid expected digest");
    }
    const expectedDigest = options.expectedDigest;
    const bytes = snapshotBinary(input);
    const digest = await resourceArchiveDigest(bytes, signal);
    signal?.throwIfAborted();
    if (digest !== expectedDigest) {
        throw new ResourceArchiveError("Resource archive digest mismatch");
    }
    const decoded = await readZip(bytes, capturedOptions);
    const files = new Map(decoded.entries.map((entry) => [entry.path, entry.bytes]));
    const metadata = files.get("resources.json");
    if (!metadata || metadata.size > 16 * 1024 * 1024) {
        throw new ResourceArchiveError("Resource archive requires bounded resources.json metadata");
    }
    const document = resourceDocument(
        parseStrictJson(new Uint8Array(await metadata.arrayBuffer()), 16 * 1024 * 1024, 64),
    );
    files.delete("resources.json");
    const assets: VerifiedResourceArchive["assets"][number][] = [];
    for (const definition of document.assets) {
        signal?.throwIfAborted();
        if (!definition.entry.startsWith("assets/")) {
            throw new ResourceArchiveError("Resource asset entries must live under assets/");
        }
        const blob = files.get(definition.entry);
        if (!blob || blob.size !== definition.byteLength) {
            throw new ResourceArchiveError("Resource asset is missing or has a different size");
        }
        const content = new Uint8Array(await blob.arrayBuffer());
        if ((await sha256Digest(content)) !== definition.digest || mediaTypeIssue(definition.mediaType, content)) {
            throw new ResourceArchiveError("Resource asset digest or media signature mismatch");
        }
        if (definition.profiles?.includes("inline-svg")) {
            parseInlineSvgAsset(content);
        }
        files.delete(definition.entry);
        assets.push(Object.freeze({ definition, bytes: blob }));
    }
    if (files.size) {
        throw new ResourceArchiveError("Resource archive contains undeclared files");
    }
    signal?.throwIfAborted();
    return Object.freeze({ digest, bytes, document: deepFreeze(document), assets: Object.freeze(assets) });
}
