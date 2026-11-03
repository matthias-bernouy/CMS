import { sha256Digest } from "@bernouy/binary-media";
import type { Embeddings, VectorStore } from "../interfaces/Embeddings";
import { normalizedVector } from "./ranking";

/** Each distinct model/content pair is embedded once, including on an empty cache. */
export async function buildVectors(
    model: Embeddings,
    store: VectorStore | undefined,
    texts: readonly string[],
    signal: AbortSignal,
) {
    await model.initialize?.(signal);
    signal.throwIfAborted();
    const keys = await Promise.all(
        texts.map((text) => sha256Digest(new TextEncoder().encode(`${model.model}\0${text}`))),
    );
    const groups = new Map<string, { text: string; indices: number[] }>();
    keys.forEach((key, index) => {
        const group = groups.get(key);
        if (group) {
            group.indices.push(index);
        } else {
            groups.set(key, { text: texts[index]!, indices: [index] });
        }
    });
    const cached = (await store?.get([...groups.keys()])) ?? new Map();
    signal.throwIfAborted();
    const vectors: (readonly number[])[] = new Array(texts.length);
    const missing: { key: string; text: string; indices: readonly number[] }[] = [];
    for (const [key, group] of groups) {
        const raw = cached.get(key);
        if (raw) {
            try {
                const vector = normalizedVector(raw);
                group.indices.forEach((index) => {
                    vectors[index] = vector;
                });
                continue;
            } catch {
                // Optional cache corruption must not prevent a rebuild.
            }
        }
        missing.push({ key, ...group });
    }
    for (let start = 0; start < missing.length; start += 16) {
        signal.throwIfAborted();
        const batch = missing.slice(start, start + 16);
        const result = await model.embed(
            batch.map(({ text }) => text),
            "passage",
            AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        );
        signal.throwIfAborted();
        if (result.length !== batch.length) {
            throw new Error("Invalid document embedding count");
        }
        const saved = batch.map((group, offset) => {
            const vector = normalizedVector(result[offset]!);
            group.indices.forEach((index) => {
                vectors[index] = vector;
            });
            return { key: group.key, vector };
        });
        await store?.put(saved);
    }
    return { vectors, embedded: missing.length };
}
