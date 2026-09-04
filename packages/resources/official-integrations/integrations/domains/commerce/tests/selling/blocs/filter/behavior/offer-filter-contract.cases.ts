import { describe, expect, test } from "bun:test";
import {
    filterControls,
    filterableFields,
    numericRange,
} from "@bernouy/cms-official-integrations/integrations/ulvia/blocs/domains/commerce/commerce-offer-filter/schema/schema-helpers.ts";
import {
    formatRangeValue,
    isRangeValue,
    snapRangeValue,
} from "@bernouy/cms-official-integrations/integrations/ulvia/blocs/domains/commerce/commerce-offer-filter/range/range-values.ts";
import { tennisSchema } from "../support/offer-filter-panel.fixtures";

describe("Commerce offer filter contracts", () => {
    test("keeps filter params injective and numeric ranges precise", () => {
        const fields = filterableFields(tennisSchema);

        expect(fields.map((field) => field.key)).toEqual(["string_pattern", "model_year"]);
        expect(filterControls(fields[0])).toEqual([
            { operator: "eq", param: "filter_string_pattern", valueType: "string" },
        ]);
        expect(filterControls(fields[1])).toEqual([
            { operator: "gte", param: "filter_model_year:gte", valueType: "number" },
            { operator: "lte", param: "filter_model_year:lte", valueType: "number" },
        ]);
        expect(numericRange(fields[1])).toEqual({ minimum: 2020, maximum: 2024, step: 1 });
        expect(numericRange({ ...fields[1], range: null })).toBeNull();

        const hyphenated = { ...fields[0], key: "string-pattern" };
        expect(filterControls(hyphenated)[0]?.param).toBe("filter_string-pattern");
        expect(filterControls(fields[0])[0]?.param).toBe("filter_string_pattern");
        expect(filterControls(hyphenated)[0]?.param).not.toBe(filterControls(fields[0])[0]?.param);
        const bounded = { ...fields[1], key: "foo" };
        const suffixKey = { ...fields[0], key: "foo_min" };
        expect(filterControls(bounded)[0]?.param).toBe("filter_foo:gte");
        expect(filterControls(suffixKey)[0]?.param).toBe("filter_foo_min");
        expect(filterControls(bounded)[0]?.param).not.toBe(filterControls(suffixKey)[0]?.param);

        const preciseMinimum = 1.000000000000001;
        const preciseMaximum = 1.000000000000002;
        const precise = snapRangeValue(preciseMinimum, preciseMinimum, preciseMaximum, 1e-15, preciseMinimum);
        expect(precise).toBeGreaterThanOrEqual(preciseMinimum);
        expect(precise).toBeLessThanOrEqual(preciseMaximum);
        expect(isRangeValue(1000000000000.002, 1000000000000.001, 1000000000000.002, 0.001)).toBe(true);
        expect(isRangeValue(1000000000000.003, 1000000000000.001, 1000000000000.005, 0.001)).toBe(true);
        expect(isRangeValue(1000000000000.0035, 1000000000000.001, 1000000000000.005, 0.001)).toBe(false);
        expect(typeof formatRangeValue(12.5, "fr_FR", 1)).toBe("string");
    });
});
