import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components";
import {
    appendSourceContent,
    urlSourceWrapper,
} from "cms-control/components/admin/Resources/Dashboards/runtime/mountSource";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard source states", () => {
    test("keeps editable content unmounted after a failed load and retries safely", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            if (calls === 1) {
                return new Response("unavailable", { status: 503 });
            }
            return Response.json({ mode: "marketplace" });
        }) as unknown as typeof fetch;

        const core = document.createElement("cms-binding-core");
        const wrapper = urlSourceWrapper("/settings", "dashboardData");
        const editable = document.createElement("section");
        editable.dataset.editableSettings = "true";
        editable.innerHTML = '<button type="button">Save settings</button>';
        appendSourceContent(wrapper, editable);
        core.append(wrapper);
        document.body.append(core);

        await waitFor(() => wrapper.querySelector("[role='alert']") !== null);

        expect(wrapper.querySelector("[data-editable-settings]")).toBeNull();
        expect(wrapper.textContent).toContain("Unable to load this data");
        expect(wrapper.textContent).toContain("Nothing can be changed until the data is available.");
        expect(wrapper.textContent).toContain("HTTP 503");
        expect(wrapper.textContent).not.toContain("Save settings");

        wrapper.querySelector<HTMLButtonElement>("[data-dashboard-source-retry]")!.click();
        await waitFor(() => wrapper.querySelector("[data-editable-settings]") !== null);

        expect(calls).toBe(2);
        expect(wrapper.querySelector("[role='alert']")).toBeNull();
        expect(wrapper.textContent).toContain("Save settings");
    });

    test("still mounts creation content for an empty successful response", async () => {
        globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;

        const core = document.createElement("cms-binding-core");
        const wrapper = urlSourceWrapper("/new-record", "dashboardData");
        const creationForm = document.createElement("form");
        creationForm.dataset.creationForm = "true";
        appendSourceContent(wrapper, creationForm);
        core.append(wrapper);
        document.body.append(core);

        await waitFor(() => wrapper.querySelector("[data-creation-form]") !== null);

        expect(wrapper.querySelector("[role='alert']")).toBeNull();
        expect(wrapper.querySelector("[data-creation-form]")).not.toBeNull();
    });
});

async function waitFor(predicate: () => boolean, timeout = 1_000): Promise<void> {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) {
            throw new Error("Timed out waiting for dashboard source state");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
