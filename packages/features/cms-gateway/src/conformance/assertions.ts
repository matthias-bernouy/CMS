import type { CapabilityDefinition, ConformanceExpectation } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { ConformanceInvocationOutcome } from "./interfaces";
import { readConformancePointer, resolveConformanceTemplate } from "./templates";

export function assertConformanceOutcome(
    outcome: ConformanceInvocationOutcome,
    expectation: ConformanceExpectation,
    capability: CapabilityDefinition,
    captures: ReadonlyMap<string, unknown>,
): void {
    const wrongError = outcome.kind === "error" && expectation.kind === "error" && outcome.code !== expectation.code;
    if (outcome.kind !== expectation.kind || wrongError) {
        throw new Error(
            outcome.kind === "error"
                ? `Expected ${expectation.kind}, received error ${outcome.code}`
                : `Expected ${expectation.kind}, received success`,
        );
    }
    const schema =
        outcome.kind === "success"
            ? capability.output
            : capability.errors.find(({ code }) => code === outcome.code)?.output;
    if (schema && Object.hasOwn(outcome, "output")) {
        validateSchemaValue(schema, outcome.output, "$.output");
    }
    for (const check of expectation.checks ?? []) {
        const selected = readConformancePointer(outcome.output, check.path);
        if ("present" in check) {
            if (!selected.present) {
                throw new Error(`Expected output path ${check.path} to be present`);
            }
            continue;
        }
        const expected = resolveConformanceTemplate(check.equals, captures);
        if (!selected.present || !sameJson(selected.value, expected)) {
            throw new Error(`Output path ${check.path || "/"} does not equal its expectation`);
        }
    }
}

export function captureConformanceOutput(
    outcome: ConformanceInvocationOutcome,
    definitions: readonly { readonly name: string; readonly path: string }[] | undefined,
    captures: Map<string, unknown>,
): void {
    if (outcome.kind !== "success") {
        return;
    }
    for (const definition of definitions ?? []) {
        const selected = readConformancePointer(outcome.output, definition.path);
        if (!selected.present) {
            throw new Error(`Capture path ${definition.path || "/"} is absent`);
        }
        captures.set(definition.name, structuredClone(selected.value));
    }
}

function sameJson(left: unknown, right: unknown): boolean {
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}
