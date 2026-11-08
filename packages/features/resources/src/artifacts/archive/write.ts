import { writeZip } from "@bernouy/zip";
import type { ZipOptions } from "@bernouy/zip";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceArchiveSource, VerifiedResourceArchive } from "resources/interfaces/archive";
import { resourceDocument } from "./document";
import { readResourceArchive } from "./read";
import { resourceZipOptions } from "./limits";
import { resourceArchiveDigest } from "./digest";

/** Build-only input assembly. Verification never runs the artifact's browser code. */
export async function writeResourceArchive(
    source: ResourceArchiveSource,
    options: ZipOptions = {},
): Promise<VerifiedResourceArchive> {
    const document = resourceDocument(source.document);
    // Capture metadata and every mutable asset before the first asynchronous step.
    const metadata = canonicalizeIJson(document);
    const captured = resourceZipOptions(options);
    // writeZip captures every mutable byte array synchronously, after checking limits.
    const bytes = await writeZip([{ path: "resources.json", bytes: metadata }, ...source.assets], captured);
    return readResourceArchive(bytes, {
        ...captured,
        expectedDigest: await resourceArchiveDigest(bytes, captured.signal),
    });
}
