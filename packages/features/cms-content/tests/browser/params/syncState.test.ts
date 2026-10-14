import { afterEach, describe, expect, test } from "bun:test";
import type { CmsSyncTarget } from "@bernouy/cms-content/bindings";
import { readSyncValue, subscribeSyncValue, writeSyncValue } from "../../../src/browser/binding/params/SyncState";

const page = { scope: "page", key: "ulvia-official-editor" } satisfies CmsSyncTarget;
const session = { scope: "session", key: "ulvia-official-session" } satisfies CmsSyncTarget;
const persistent = { scope: "persistent", key: "ulvia-official-preferences" } satisfies CmsSyncTarget;
const param = { scope: "param", key: "ulvia-official-search" } satisfies CmsSyncTarget;

afterEach(() => {
    writeSyncValue(page, undefined);
    writeSyncValue(session, undefined);
    writeSyncValue(persistent, undefined);
    writeSyncValue(param, undefined);
});

describe("synchronized state", () => {
    test("stores structured page values and notifies matching subscribers", () => {
        const values: unknown[] = [];
        const stop = subscribeSyncValue(page, (value) => values.push(value));
        const value = { selected: "home", dirty: false };

        writeSyncValue(page, value);

        expect(readSyncValue(page)).toBe(value);
        expect(values).toEqual([value]);
        stop();
    });

    test("persists versioned structured values in session and persistent storage", () => {
        writeSyncValue(session, { tab: "pages" });
        writeSyncValue(persistent, ["compact", true]);

        expect(readSyncValue(session)).toEqual({ tab: "pages" });
        expect(readSyncValue(persistent)).toEqual(["compact", true]);
    });

    test("expires persistent values on read", () => {
        writeSyncValue(persistent, { stale: true }, document, { expiresAt: Date.now() - 1 });
        expect(readSyncValue(persistent)).toBeUndefined();
    });

    test("rejects structured URL parameter state", () => {
        expect(() => writeSyncValue(param, { invalid: true })).toThrow("only accepts scalar");
    });

    test("writes scalar URL parameters and notifies only matching subscribers", () => {
        const values: unknown[] = [];
        const unrelated: unknown[] = [];
        const stop = subscribeSyncValue(param, (value) => values.push(value));
        const stopUnrelated = subscribeSyncValue({ scope: "param", key: "ulvia-official-unrelated" }, (value) =>
            unrelated.push(value),
        );

        writeSyncValue(param, "articles");

        expect(new URLSearchParams(location.search).get(param.key)).toBe("articles");
        expect(readSyncValue(param)).toBe("articles");
        expect(values).toEqual(["articles"]);
        expect(unrelated).toEqual([]);
        stop();
        stopUnrelated();
    });
});
