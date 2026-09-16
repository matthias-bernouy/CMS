import { afterEach, expect, test } from "bun:test";
import "cms-control/components";
import { resetSettingsTest } from "../../../admin/resources/settingsTestUtils";

afterEach(resetSettingsTest);

test("clears saved feedback without making an unchanged form editable", async () => {
    document.body.innerHTML = `
        <form id="settings-form"><input name="name"></form>
        <cms-form-save-action form="settings-form" label="Save settings" saved-feedback-duration="10"></cms-form-save-action>
    `;
    await Promise.resolve();

    const form = document.querySelector<HTMLFormElement>("#settings-form")!;
    const action = document.querySelector("cms-form-save-action")!;
    const button = action.shadowRoot!.querySelector<HTMLElement & { disabled: boolean }>("p9r-button")!;
    const status = action.shadowRoot!.querySelector<HTMLElement>("[data-status]")!;
    form.dispatchEvent(new CustomEvent("cms-source:success"));
    expect(action.getAttribute("state")).toBe("saved");

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(action.getAttribute("state")).toBe("pristine");
    expect(status.textContent).toBe("Save settings");
    expect(button.disabled).toBe(true);
});
