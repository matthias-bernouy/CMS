import { sha256Digest } from "@bernouy/binary-media";
import type { DocumentationScope, DocumentationSource } from "../interfaces/Documentation";
import { DocumentationError, integer, record, reference } from "./input";

export async function readDocument(source: DocumentationSource, scope: DocumentationScope, input: unknown) {
    const value = record(input, ["reference", "offset"]);
    const ref = reference(value.reference);
    const offset = integer(value.offset, 0, 0, 128 * 1024);
    const release = scope.releases.find(
        (candidate) => candidate.release.contractId === ref.contractId && candidate.digest === ref.releaseDigest,
    );
    if (!release) {
        throw new DocumentationError("REVISION_CONFLICT");
    }
    const document = release.release.documentation?.find((candidate) => candidate.path === ref.path);
    if (!document) {
        throw new DocumentationError("NOT_FOUND");
    }
    const blob = await source.read(ref);
    if (!blob || blob.size !== document.byteLength) {
        throw new DocumentationError("CORE_UNAVAILABLE");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if ((await sha256Digest(bytes)) !== document.digest) {
        throw new DocumentationError("CORE_UNAVAILABLE");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (offset > text.length || (offset > 0 && /[\uDC00-\uDFFF]/u.test(text[offset]!))) {
        throw new DocumentationError("INVALID_INPUT");
    }
    let end = Math.min(offset + 16_384, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) {
        end--;
    }
    if (!(await source.isCurrent(scope.revision))) {
        throw new DocumentationError("REVISION_CONFLICT");
    }
    return {
        reference: ref,
        title: document.title,
        version: release.release.version,
        content: text.slice(offset, end),
        offset,
        nextOffset: end < text.length ? end : null,
    };
}
