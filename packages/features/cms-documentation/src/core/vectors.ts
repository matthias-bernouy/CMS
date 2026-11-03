import { VectorIndex as TextVectorIndex } from "@bernouy/text-search";
import type { DocumentationChunk } from "../interfaces/Documentation";
export { within } from "@bernouy/text-search";

export class VectorIndex extends TextVectorIndex {
    prepareDocuments(key: string, chunks: readonly DocumentationChunk[], signal?: AbortSignal) {
        return super.prepare(
            key,
            chunks.map(
                (chunk) =>
                    `${chunk.reference.contractId} ${chunk.capabilities.slice(0, 8).join(" ")}\n${chunk.title}\n${chunk.heading}\n${chunk.content}`,
            ),
            signal,
        );
    }
}
