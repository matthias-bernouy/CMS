import { expect, test } from "bun:test";
import { orderCollections } from "../../../src/commands/remote/ordering";

function collection(id: string, version: string, dependency?: string, range = "^1.0.0") {
    return {
        release: {
            publisherId: "owner",
            collectionId: id,
            version,
            dependencies: dependency
                ? [
                      {
                          publisherId: "owner",
                          collectionId: dependency,
                          versionRange: range,
                          imports: { blocs: [], themeTokens: [] },
                      },
                  ]
                : [],
        },
    };
}

test("collection ordering uses compatible local dependencies and preserves version order", () => {
    const consumer = collection("consumer", "1.0.0", "base", "^2.0.0");
    const base1 = collection("base", "1.0.0");
    const base2 = collection("base", "2.0.0");
    expect(orderCollections([consumer, base2, base1])).toEqual([base1, base2, consumer]);
});

test("collection ordering rejects local cycles while allowing dependencies held only remotely", () => {
    expect(() =>
        orderCollections([collection("first", "1.0.0", "second"), collection("second", "1.0.0", "first")]),
    ).toThrow("Cannot order");
    const consumer = collection("consumer", "1.0.0", "remote-only");
    expect(orderCollections([consumer])).toEqual([consumer]);
});
