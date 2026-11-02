import type { DocumentationChunk } from "../interfaces/Documentation";

function terms(value: string): string[] {
    return (
        value
            .normalize("NFKD")
            .toLowerCase()
            .replace(/\p{M}/gu, "")
            .match(/[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*/gu) ?? []
    );
}
export function lexicalRanking(chunks: readonly DocumentationChunk[], query: string): number[] {
    const queryTerms = [...new Set(terms(query))].slice(0, 64);
    const wanted = new Set(queryTerms);
    const documents = chunks.map((chunk) => {
        const words = terms(
            `${chunk.title} ${chunk.title} ${chunk.heading} ${chunk.heading} ${chunk.reference.path} ${chunk.capabilities.slice(0, 16).join(" ")} ${chunk.content}`,
        );
        const counts = new Map<string, number>();
        for (const word of words) {
            if (wanted.has(word)) {
                counts.set(word, (counts.get(word) ?? 0) + 1);
            }
        }
        return { length: words.length, counts };
    });
    const average = documents.reduce((sum, document) => sum + document.length, 0) / Math.max(1, documents.length);
    const scores = documents.map(() => 0);
    for (const term of queryTerms) {
        const df = documents.filter((document) => document.counts.has(term)).length;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        documents.forEach((document, index) => {
            const tf = document.counts.get(term) ?? 0;
            scores[index]! += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * document.length) / Math.max(average, 1)));
        });
    }
    return scores
        .map((score, index) => ({ score, index }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((row) => row.index);
}
export function normalizedVector(value: readonly number[]): readonly number[] {
    if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > 4096 ||
        value.some((part) => !Number.isFinite(part))
    ) {
        throw new TypeError("Invalid embedding vector");
    }
    const norm = Math.hypot(...value);
    if (!norm || !Number.isFinite(norm)) {
        throw new TypeError("Empty embedding vector");
    }
    return value.map((part) => part / norm);
}
export function semanticRanking(vectors: readonly (readonly number[])[], query: readonly number[]): number[] {
    const q = normalizedVector(query);
    return vectors
        .map((raw, index) => {
            const vector = normalizedVector(raw);
            if (vector.length !== q.length) {
                throw new TypeError("Embedding dimensions disagree");
            }
            return { index, score: vector.reduce((sum, part, offset) => sum + part * q[offset]!, 0) };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((row) => row.index);
}
export function fusedRanking(...lists: readonly (readonly number[])[]): number[] {
    const scores = new Map<number, number>();
    for (const list of lists) {
        list.slice(0, 50).forEach((index, rank) => scores.set(index, (scores.get(index) ?? 0) + 1 / (60 + rank + 1)));
    }
    return [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([index]) => index);
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
