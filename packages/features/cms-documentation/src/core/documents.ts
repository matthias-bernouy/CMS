import { sha256Digest } from "@bernouy/binary-media";
import { parseDocumentationMarkdown } from "@bernouy/cms-repository/contracts/documentation";
import type { DocumentationChunk, DocumentationScope, DocumentationSource } from "../interfaces/Documentation";
import { DocumentationError } from "./input";

const CORPUS_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = 4096;
const CHUNK_LENGTH = 1800;

export async function loadDocuments(
    scope: DocumentationScope,
    source: DocumentationSource,
): Promise<readonly DocumentationChunk[]> {
    const definitions = scope.releases.flatMap((release) =>
        (release.release.documentation ?? []).map((document) => ({ release, document })),
    );
    if (
        scope.releases.length > 128 ||
        definitions.length > 512 ||
        definitions.reduce((sum, item) => sum + item.document.byteLength, 0) > CORPUS_BYTES
    ) {
        throw new DocumentationError("CORE_UNAVAILABLE");
    }
    const chunks: DocumentationChunk[] = [];
    for (const { release, document } of definitions) {
        const reference = {
            contractId: release.release.contractId,
            releaseDigest: release.digest,
            path: document.path,
        };
        const blob = await source.read(reference);
        if (!blob || blob.size !== document.byteLength) {
            throw new DocumentationError("CORE_UNAVAILABLE");
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if ((await sha256Digest(bytes)) !== document.digest) {
            throw new DocumentationError("CORE_UNAVAILABLE");
        }
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const parsed = parseDocumentationMarkdown(content);
        if (parsed.title !== document.title) {
            throw new DocumentationError("CORE_UNAVAILABLE");
        }
        const capabilities = release.release.capabilities
            .filter((capability) => capability.docs?.includes(document.path))
            .map((capability) => capability.id);
        let offset = 0;
        for (const section of parsed.sections) {
            let position = 0;
            while (position < section.content.length) {
                let end = Math.min(position + CHUNK_LENGTH, section.content.length);
                if (end < section.content.length) {
                    const paragraph = section.content.lastIndexOf("\n\n", end);
                    if (paragraph > position + CHUNK_LENGTH / 2) {
                        end = paragraph + 2;
                    }
                    if (/[\uD800-\uDBFF]/u.test(section.content[end - 1]!)) {
                        end--;
                    }
                }
                chunks.push({
                    reference,
                    version: release.release.version,
                    title: parsed.title,
                    heading: section.heading,
                    capabilities,
                    content: section.content.slice(position, end),
                    offset: offset + position,
                });
                if (chunks.length > MAX_CHUNKS) {
                    throw new DocumentationError("CORE_UNAVAILABLE");
                }
                position = end;
            }
            offset += section.content.length;
        }
    }
    return chunks;
}
