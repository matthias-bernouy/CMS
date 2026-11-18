import { expect, test } from "bun:test";
import { initializationTerminal } from "./completion";
import { recipePage } from "./list";

test("initialization completion requires the exact reviewed state and never credits another or failed operation", () => {
    const dataset = { root: null, paths: [], collections: 0 };
    const terminal = {
        status: "completed",
        operationId: "",
        operationStatus: "none",
        errorMessage: "",
        planDigest: "review",
        rootJson: "null",
        completedPages: 0,
        totalPages: 0,
        revision: 2,
        locale: "en",
        redirectPath: "",
    };
    expect(initializationTerminal(terminal, "accepted", "review", dataset)).toEqual({
        status: "completed",
        planDigest: "review",
        rootJson: "null",
        completedPages: 0,
        totalPages: 0,
        revision: 2,
        locale: "en",
        redirectPath: "",
    });
    expect(
        initializationTerminal(
            { status: "running", operationId: "accepted", operationStatus: "running" },
            "accepted",
            "review",
            dataset,
        ),
    ).toBeUndefined();
    for (const change of [
        { operationId: "other" },
        { operationStatus: "failed" },
        { planDigest: "stale" },
        { completedPages: 1 },
        { rootJson: "{}" },
    ]) {
        expect(() => initializationTerminal({ ...terminal, ...change }, "accepted", "review", dataset)).toThrow();
    }
});

test("recipe page oracles reject oversized pages and duplicated exact roots", () => {
    const item = {
        root: {
            publisherId: "performance",
            collectionId: "performance/fixture",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
            bootstrapId: "start",
        },
        label: "Recipe",
        description: "Description",
        pageCount: 1,
        includeCount: 0,
    };
    expect(recipePage({ items: [item], cursor: "" }).items).toHaveLength(1);
    expect(() => recipePage({ items: [item, item], cursor: "" })).toThrow();
    expect(() =>
        recipePage({
            items: Array.from({ length: 5 }, (_value, index) => ({
                ...item,
                root: { ...item.root, version: `1.${index}.0` },
            })),
            cursor: "",
        }),
    ).toThrow();
    expect(() => recipePage({ items: [item], cursor: null })).toThrow();
});
