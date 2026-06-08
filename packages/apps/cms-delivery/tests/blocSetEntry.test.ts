import { describe, test, expect } from "bun:test";
import { generateBlocSetEntry } from "cms-delivery/core/blocs/buildBloc";
import type { DeliveryRepository } from "cms-delivery/interfaces/DeliveryRepository";

/** Minimal repository stub — only `getBlocViewJS` is exercised here. */
function repoWith(map: Record<string, string | null>): DeliveryRepository {
    return { getBlocViewJS: async (tag: string) => map[tag] ?? null } as unknown as DeliveryRepository;
}
const decode = (e: { raw: Uint8Array }) => new TextDecoder().decode(e.raw);

describe("generateBlocSetEntry", () => {
    test("concatenates every bloc's viewJS into one text/javascript bundle", async () => {
        const e = await generateBlocSetEntry(["a", "b"], repoWith({ a: "AAA();", b: "BBB();" }));
        const out = decode(e);
        expect(out).toContain("AAA();");
        expect(out).toContain("BBB();");
        expect(e.contentType).toBe("text/javascript");
    });

    test("is order- and duplicate-independent → stable hash (cross-page reuse)", async () => {
        const repo = repoWith({ a: "AAA();", b: "BBB();" });
        const e1 = await generateBlocSetEntry(["a", "b"], repo);
        const e2 = await generateBlocSetEntry(["b", "a", "a"], repo);
        expect(e2.hash).toBe(e1.hash);
    });

    test("prefixes each bloc with `;` so concatenated IIFEs can't ASI-merge", async () => {
        const out = decode(await generateBlocSetEntry(["a", "b"], repoWith({ a: "(()=>{})()", b: "(()=>{})()" })));
        expect(out).toContain(";/* a */");
        expect(out).toContain(";/* b */");
    });

    test("skips a vanished bloc and bundles the survivors", async () => {
        const out = decode(await generateBlocSetEntry(["a", "missing"], repoWith({ a: "AAA();" })));
        expect(out).toContain("AAA();");
        expect(out).not.toContain("missing");
    });

    test("throws only when no tag resolves", () => {
        expect(generateBlocSetEntry(["x", "y"], repoWith({}))).rejects.toThrow();
    });

    test("throws on an empty tag set", () => {
        expect(generateBlocSetEntry([], repoWith({}))).rejects.toThrow();
    });
});
