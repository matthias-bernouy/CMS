import { expect, test } from "bun:test";
import { assertMetadataProviderObservation } from "./observation";

const baseline = { revision: 2, observedAt: "2020-01-01T00:00:00.000Z" };

test("metadata observation diagnostics keep integer, monotonic and clock bounds for both row categories", () => {
    for (const controlled of [false, true]) {
        const kind = controlled ? "controlled" : "baseline";
        expect(() => assertMetadataProviderObservation({ ...baseline }, baseline, controlled)).not.toThrow();
        expect(() =>
            assertMetadataProviderObservation(
                { revision: 3, observedAt: "2020-01-02T00:00:00.000Z" },
                baseline,
                controlled,
            ),
        ).not.toThrow();
        for (const revision of ["2", 1.5, NaN, Infinity]) {
            expect(() => assertMetadataProviderObservation({ ...baseline, revision }, baseline, controlled)).toThrow(
                `metadata-provider-${kind}-revision-integer`,
            );
        }
        expect(() => assertMetadataProviderObservation({ ...baseline, revision: 1 }, baseline, controlled)).toThrow(
            `metadata-provider-${kind}-revision-monotonic`,
        );
        expect(() =>
            assertMetadataProviderObservation({ ...baseline, observedAt: undefined }, baseline, controlled),
        ).toThrow(`metadata-provider-${kind}-observation-string`);
        for (const observedAt of ["invalid", "2019-01-01T00:00:00.000Z"]) {
            expect(() => assertMetadataProviderObservation({ ...baseline, observedAt }, baseline, controlled)).toThrow(
                `metadata-provider-${kind}-observation-monotonic`,
            );
        }
        expect(() => assertMetadataProviderObservation(baseline, { revision: 2 }, controlled)).toThrow(
            `metadata-provider-${kind}-observation-monotonic`,
        );
        const future = new Date(Date.now() + 60_000).toISOString();
        expect(() =>
            assertMetadataProviderObservation({ ...baseline, observedAt: future }, baseline, controlled),
        ).toThrow(`metadata-provider-${kind}-observation-not-future`);
    }
});

test("metadata observation errors do not retain private or remote values", () => {
    const privateValue = "private-token-and-installation";
    try {
        assertMetadataProviderObservation({ revision: privateValue, observedAt: privateValue }, baseline, false);
        throw new Error("Expected refusal");
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain("metadata-provider-baseline-revision-integer");
        expect(String(error)).not.toContain(privateValue);
    }
});
