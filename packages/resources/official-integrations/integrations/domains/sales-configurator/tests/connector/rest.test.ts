import { describe, expect, test } from "bun:test";
import { exactFilter } from "../../connectors/supabase/functions/cms-sales-configurator/core/rest";

describe("sales-configurator PostgREST filters", () => {
    test("keeps scalar equality values unquoted", () => {
        expect(exactFilter(42)).toBe("eq.42");
        expect(exactFilter("active")).toBe("eq.active");
        expect(exactFilter("local:019f99f8-0000")).toBe("eq.local:019f99f8-0000");
        expect(exactFilter("partner,regional")).toBe("eq.partner,regional");
    });

    test("relies on URLSearchParams to encode user-controlled scalar values", () => {
        const params = new URLSearchParams({
            cms_user_id: exactFilter('partner & "associé"'),
        });

        expect(params.toString()).toBe("cms_user_id=eq.partner+%26+%22associ%C3%A9%22");
        expect(params.get("cms_user_id")).toBe('eq.partner & "associé"');
    });
});
