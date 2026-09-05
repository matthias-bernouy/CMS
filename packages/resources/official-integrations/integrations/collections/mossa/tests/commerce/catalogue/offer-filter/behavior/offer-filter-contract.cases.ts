import { describe, expect, test } from "bun:test";
import {
    filterControls,
    filterableFields,
    numericRange,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-filter/schema/schema-helpers.ts";
import {
    formatRangeValue,
    isRangeValue,
    snapRangeValue,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-filter/range/range-values.ts";
import { primarySchema } from "../support/offer-filter-panel.fixtures";

describe("Commerce offer filter contracts", () => {
    test("keeps filter params injective and numeric ranges precise", () => {
        const fields = filterableFields(primarySchema);

        expect(fields.map((field) => field.key)).toEqual(["choice_attribute", "numeric_attribute"]);
        expect(filterControls(fields[0])).toEqual([
            { operator: "eq", param: "filter_choice_attribute", valueType: "string" },
        ]);
        expect(filterControls(fields[1])).toEqual([
            { operator: "gte", param: "filter_numeric_attribute:gte", valueType: "number" },
            { operator: "lte", param: "filter_numeric_attribute:lte", valueType: "number" },
        ]);
        expect(numericRange(fields[1])).toEqual({ minimum: 2020, maximum: 2024, step: 1 });
        expect(numericRange({ ...fields[1], range: null })).toBeNull();

        const hyphenated = { ...fields[0], key: "choice-attribute" };
        expect(filterControls(hyphenated)[0]?.param).toBe("filter_choice-attribute");
        expect(filterControls(fields[0])[0]?.param).toBe("filter_choice_attribute");
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
