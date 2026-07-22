import { afterEach, describe, expect, test } from "bun:test";
import { PageStateSync } from "../../../src/binding/params/PageStateSync";
import { setState } from "../../../src/binding/params";

afterEach(() => {
    document.body.replaceChildren();
});

async function waitFor(predicate: () => boolean, tries = 40): Promise<void> {
    for (let attempt = 0; attempt < tries; attempt++) {
        if (predicate()) {
            return;
        }
        await Bun.sleep(10);
    }
}

describe("PageStateSync child updates", () => {
    test("re-applies page state when an asynchronous select option arrives", async () => {
        const select = document.createElement("select");
        select.setAttribute("cms-page-state", "category");
        document.body.append(select);
        setState("category", "news", document);
        const sync = new PageStateSync(select);
        sync.start();

        expect(select.value).toBe("");

        const option = document.createElement("option");
        option.value = "news";
        option.textContent = "News";
        select.append(option);

        await waitFor(() => select.value === "news");

        expect(select.value).toBe("news");
        sync.dispose();
    });
});
