import { z } from "zod";
import type { $ZodChecks, $ZodType } from "zod/v4/core";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

const lengthConditions = new Map([
    ["min_length", z.array(z.unknown()).min(0)._zod.def.checks![0]!._zod.def.when],
    ["max_length", z.array(z.unknown()).max(0)._zod.def.checks![0]!._zod.def.when],
    ["length_equals", z.array(z.unknown()).length(0)._zod.def.checks![0]!._zod.def.when],
]);

export function schemaChecks(schema: $ZodType, allowed: readonly string[], path: string) {
    const self = "check" in schema._zod.def ? [schema as unknown as $ZodChecks] : [];
    return [...self, ...(schema._zod.def.checks ?? [])].map((check) => {
        const definition = (check as $ZodChecks)._zod.def;
        if (
            !allowed.includes(definition.check) ||
            (definition.when && definition.when !== lengthConditions.get(definition.check))
        ) {
            throw new SdkDefinitionError(`Unsupported Zod check ${definition.check}`, path);
        }
        return definition;
    });
}

export function lengthBounds(schema: $ZodType, path: string): { minimum?: number; maximum?: number } {
    let minimum: number | undefined;
    let maximum: number | undefined;
    for (const check of schemaChecks(schema, ["min_length", "max_length", "length_equals"], path)) {
        switch (check.check) {
            case "min_length":
                minimum = Math.max(minimum ?? 0, check.minimum);
                break;
            case "max_length":
                maximum = Math.min(maximum ?? Infinity, check.maximum);
                break;
            case "length_equals":
                minimum = Math.max(minimum ?? 0, check.length);
                maximum = Math.min(maximum ?? Infinity, check.length);
                break;
        }
    }
    return { minimum, maximum };
}
