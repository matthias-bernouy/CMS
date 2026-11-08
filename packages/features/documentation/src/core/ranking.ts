import type { DocumentationChunk } from "../interfaces/Documentation";
import { lexicalRanking as rankTexts } from "@bernouy/text-search";
export { normalizedVector, semanticRanking, fusedRanking } from "@bernouy/text-search";

export function lexicalRanking(chunks: readonly DocumentationChunk[], query: string): number[] {
    return rankTexts(
        chunks.map(
            (chunk) =>
                `${chunk.title} ${chunk.title} ${chunk.heading} ${chunk.heading} ${chunk.reference.path} ${chunk.capabilities.slice(0, 16).join(" ")} ${chunk.content}`,
        ),
        query,
    );
}

export function rankedDocuments(chunks: readonly DocumentationChunk[], ranking: readonly number[], limit: number) {
    const seen = new Set<string>();
    return ranking.flatMap((index) => {
        const chunk = chunks[index]!;
        const key = `${chunk.reference.releaseDigest}\0${chunk.reference.path}`;
        if (seen.has(key) || seen.size >= limit) {
            return [];
        }
        seen.add(key);
        return [
            {
                reference: chunk.reference,
                version: chunk.version,
                title: chunk.title,
                heading: chunk.heading,
                excerpt: chunk.content.slice(0, 1600).toWellFormed(),
                capabilities: chunk.capabilities,
            },
        ];
    });
}
