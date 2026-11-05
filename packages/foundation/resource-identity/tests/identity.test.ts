import { expect, test } from "bun:test";
import {
    assertResourceId,
    isResourceId,
    resourceName,
    resourcePublisher,
    resourceRuntimeNamespace,
} from "../src/exports";

test("resource references require one bounded owning namespace and one name", () => {
    expect(resourcePublisher("ulvia/primary-provider")).toBe("ulvia");
    expect(resourceName("ulvia/primary-provider")).toBe("primary-provider");
    for (const value of [
        "primary-provider",
        "ulvia/",
        "/provider",
        "ulvia/../provider",
        "ulvia/provider/extra",
        "Ulvia/provider",
        "ulvia/%2f",
        "ulvia/ provider",
        `${"a".repeat(97)}/provider`,
    ]) {
        expect(isResourceId(value)).toBe(false);
        expect(() => assertResourceId(value)).toThrow();
    }
});

test("runtime namespaces distinguish publisher punctuation and resource names", () => {
    const references = [
        "ulvia/mossa",
        "other/mossa",
        "a.b/cards",
        "a-b/cards",
        "a-hb/cards",
        "a/db-cards",
        "a-d/b-cards",
    ];
    const prefixes = references.map(resourceRuntimeNamespace);
    expect(new Set(prefixes).size).toBe(references.length);
    expect(prefixes.every((value) => /^[a-z][a-z0-9-]*$/u.test(value))).toBe(true);
    expect(prefixes[0]).toBe("ulvia--mossa");
});
