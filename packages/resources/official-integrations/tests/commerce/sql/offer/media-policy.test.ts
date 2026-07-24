import { describe, expect, test } from "bun:test";
import { loadSupabaseSchemaSql } from "../../../helpers/supabaseSql";

const commerceRoot = new URL("../../../../integrations/domains/commerce/versions/1.0.0/", import.meta.url);

describe("Commerce media count policy", () => {
    test("installs backward-compatible product and offer bounds", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot);

        expect(schema).toContain("product_image_min_count integer not null default 0");
        expect(schema).toContain("product_image_max_count integer not null default 20");
        expect(schema).toContain("offer_image_min_count integer not null default 0");
        expect(schema).toContain("offer_image_max_count integer not null default 20");
        expect(schema).toContain("0 <= minimum <= maximum <= 20");
    });

    test("guards uploads, removals, activation, and seller submission", async () => {
        const schema = await loadSupabaseSchemaSql(commerceRoot);

        expect(schema).toContain("an offer cannot have more than % images");
        expect(schema).toContain("a product cannot have more than % images");
        expect(schema).toContain("a submitted offer must keep at least % images");
        expect(schema).toContain("an active public product must keep at least % images");
        expect(schema).toContain("an offer must have between % and % images");
        expect(schema).toContain("an active public product must have between % and % images");
    });
});
