import { describe, expect, test } from "bun:test";
import { connector, evaluator, functionTemplate, httpEndpoint, packageState } from "./fixtures";

describe("integration function response constraints", () => {
    test("treats a narrowed response enum as additive and a widened enum as breaking", () => {
        const baseline = responsePackage("1.0.0", { type: "string", enum: ["draft", "published"] });
        const narrowedPatch = evaluate(baseline, "1.0.1", { type: "string", enum: ["published"] });
        const narrowedMinor = evaluate(baseline, "1.1.0", { type: "string", enum: ["published"] });
        const widened = evaluate(baseline, "1.1.0", {
            type: "string",
            enum: ["archived", "draft", "published"],
        });

        expect(narrowedPatch).toMatchObject({ contractAdmissible: false, requiredReleaseLevel: "minor" });
        expect(narrowedMinor.contractAdmissible).toBeTrue();
        expect(narrowedMinor.evidence).toContainEqual(expect.objectContaining({ code: "response-enum-narrowed" }));
        expect(widened).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(widened.evidence).toContainEqual(expect.objectContaining({ code: "response-enum-widened" }));
    });

    test("compares scalar bounds using response covariance", () => {
        const baseline = responsePackage("1.0.0", {
            type: "string",
            minLength: 2,
            maxLength: 20,
        });
        const strengthened = evaluate(baseline, "1.1.0", {
            type: "string",
            minLength: 4,
            maxLength: 10,
        });
        const weakened = evaluate(baseline, "1.0.1", {
            type: "string",
            minLength: 1,
            maxLength: 30,
        });

        expect(strengthened.contractAdmissible).toBeTrue();
        expect(strengthened.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining(["response-min-length-strengthened", "response-max-length-strengthened"]),
        );
        expect(weakened).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(weakened.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining(["response-min-length-weakened", "response-max-length-weakened"]),
        );
    });

    test("fails closed when a response pattern changes without a containment proof", () => {
        const baseline = responsePackage("1.0.0", { type: "string", pattern: "^[a-z]+$" });
        const changed = evaluate(baseline, "1.1.0", { type: "string", pattern: "^[a-z0-9]+$" });

        expect(changed).toMatchObject({ contractAdmissible: false, outcome: "unknown" });
        expect(changed.evidence).toContainEqual(expect.objectContaining({ code: "response-pattern-changed" }));
    });

    test("classifies numeric and array bounds", () => {
        const number = evaluate(responsePackage("1.0.0", { type: "number", minimum: 0, maximum: 100 }), "1.1.0", {
            type: "number",
            minimum: 10,
            maximum: 90,
        });
        const array = evaluate(responsePackage("1.0.0", { type: "array", minItems: 1, maxItems: 10 }), "1.0.1", {
            type: "array",
            minItems: 0,
            maxItems: 20,
        });

        expect(number.contractAdmissible).toBeTrue();
        expect(array).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
    });
});

function evaluate(baseline: ReturnType<typeof responsePackage>, version: string, body: Record<string, unknown>) {
    return evaluator().evaluate({ baseline, candidate: responsePackage(version, body) });
}

function responsePackage(version: string, body: Record<string, unknown>) {
    const fn = functionTemplate({
        compatibility: {
            http: {
                requiredSecrets: [],
                endpoints: [httpEndpoint({ responses: [{ status: "200", body }] })],
            },
        },
    });
    return packageState(version, { connectors: [connector({ functions: [fn] })] });
}
