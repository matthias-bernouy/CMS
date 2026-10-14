import { afterEach, describe, expect, test } from "bun:test";
import type { CmsSyncTarget } from "@bernouy/cms-content/bindings";
import { SyncControl } from "../../../src/browser/binding/state/SyncControl";
import { readSyncValue, writeSyncValue } from "../../../src/browser/binding/state/SyncState";

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

    test("preserves the authored default until synchronized state exists", () => {
        const input = document.createElement("input");
        input.value = "authored";
        input.setAttribute("cms-sync", "@page:ulvia-official-filter");
        document.body.append(input);
        const sync = new SyncControl(input);

        sync.start();

        expect(input.value).toBe("authored");
        sync.dispose();
    });

    test("reflects a select after its options are populated", async () => {
        writeSyncValue(target, "news");
        const select = document.createElement("select");
        select.setAttribute("cms-sync", "@page:ulvia-official-filter");
        document.body.append(select);
        const sync = new SyncControl(select);
        sync.start();

        select.innerHTML = '<option value="news">News</option><option value="sport">Sport</option>';
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(select.value).toBe("news");
        sync.dispose();
    });

    test("waits for a custom control definition before reflecting state", async () => {
        const tag = `sync-control-${crypto.randomUUID()}`;
        const control = document.createElement(tag) as HTMLElement & { value: string };
        control.setAttribute("cms-sync", "@page:ulvia-official-filter");
        document.body.append(control);
        writeSyncValue(target, "ready");
        const sync = new SyncControl(control);
        sync.start();

        customElements.define(
            tag,
            class extends HTMLElement {
                value = "authored";
            },
        );
        await customElements.whenDefined(tag);
        await Promise.resolve();

        expect(control.value).toBe("ready");
        sync.dispose();
    });
});
