import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, sha256Hex } from "../../src/core/digest";

describe("browser-compatible SHA-256 digest", () => {
    test("matches the SHA-256 reference vector and returns lowercase hexadecimal", async () => {
        await expect(sha256Hex("abc")).resolves.toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });

    test("derives package identity from canonical JSON rather than insertion order", async () => {
        const first = { b: 2, nested: { y: true, x: null }, a: 1 };
        const second = { a: 1, nested: { x: null, y: true }, b: 2 };

        await expect(computeIntegrationPackageDigest(first)).resolves.toBe(
            await computeIntegrationPackageDigest(second),
        );
    });

    test("covers exact Unicode contents without normalizing them", async () => {
        const composed = await computeIntegrationPackageDigest({ text: "é" });
        const decomposed = await computeIntegrationPackageDigest({ text: "e\u0301" });

        expect(composed).toHaveLength(64);
        expect(composed).not.toBe(decomposed);
    });

    test("matches a known canonical package-independent object digest", async () => {
        await expect(computeIntegrationPackageDigest({ b: 2, a: 1 })).resolves.toBe(
            "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
        );
    });
});
