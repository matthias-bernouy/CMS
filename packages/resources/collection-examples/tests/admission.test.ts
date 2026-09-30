import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { checkoutExample, checkoutMarkup } from "../src";

test("the displayed checkout is the admitted collection composition", async () => {
    const admitted = await admitCollectionRelease(checkoutExample);
    expect(admitted.release.texts).toHaveLength(7);
    expect(admitted.release.blocs[0]).toMatchObject({
        kind: "composition",
        lightdom: String(checkoutMarkup),
    });
    expect(admitted.digest).toStartWith("sha256:");
});
