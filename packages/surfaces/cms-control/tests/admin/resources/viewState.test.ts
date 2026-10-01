import { afterEach, describe, expect, test } from "bun:test";
import "../../../src/components/admin/Common/ViewState/ViewState";

afterEach(() => document.body.replaceChildren());

describe("cms-view-state", () => {
    test("exposes loading and error accessibility states", () => {
        const state = document.createElement("cms-view-state");
        state.setAttribute("state", "loading");
        document.body.append(state);
        expect(state.getAttribute("aria-busy")).toBe("true");
        expect(state.getAttribute("role")).toBe("status");

        state.setAttribute("state", "error");
        expect(state.getAttribute("aria-busy")).toBe("false");
        expect(state.getAttribute("role")).toBe("alert");
    });

    test("publishes a composed retry event", () => {
        const state = document.createElement("cms-view-state");
        state.setAttribute("state", "error");
        state.setAttribute("retry", "");
        document.body.append(state);
        let retried = false;
        state.addEventListener("retry", () => {
            retried = true;
        });
        state.shadowRoot!.querySelector<HTMLButtonElement>("[data-retry]")!.click();
        expect(retried).toBe(true);
    });
});
