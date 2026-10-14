import { afterEach, describe, expect, test } from "bun:test";
import type { CmsSyncTarget } from "@bernouy/cms-content/bindings";
import { SyncControl } from "../../../src/browser/binding/params/SyncControl";
import { readSyncValue, writeSyncValue } from "../../../src/browser/binding/params/SyncState";

const target = { scope: "page", key: "ulvia-official-filter" } satisfies CmsSyncTarget;

afterEach(() => {
    writeSyncValue(target, undefined);
    document.body.replaceChildren();
});

describe("cms-sync controls", () => {
    test("publishes control changes and reflects external state", () => {
        const input = document.createElement("input");
        input.setAttribute("cms-sync", "@page:ulvia-official-filter");
        document.body.append(input);
        const sync = new SyncControl(input);
        sync.start();

        input.value = "published";
        input.dispatchEvent(new Event("change"));
        expect(readSyncValue(target)).toBe("published");

        writeSyncValue(target, "draft");
        expect(input.value).toBe("draft");
        sync.dispose();
    });

    test("keeps checkboxes typed as booleans", () => {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("cms-sync", "@page:ulvia-official-filter");
        document.body.append(input);
        const sync = new SyncControl(input);
        sync.start();

        input.checked = true;
        input.dispatchEvent(new Event("change"));
        expect(readSyncValue(target)).toBe(true);

        writeSyncValue(target, false);
        expect(input.checked).toBe(false);
        sync.dispose();
    });
});
