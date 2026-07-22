import { afterEach, describe, expect, test } from "bun:test";
import { collectFormData } from "../../../src/binding/submit/formSubmit";
import { resetDom } from "../testUtils";
import { form, withEmptyFormData } from "./formTestUtils";

afterEach(resetDom);

describe("formSubmit fallback controls", () => {
    test("reads light DOM controls when native FormData is empty", () => {
        const target = form(`<form><input name="q" value="fallback"></form>`);
        withEmptyFormData(() => {
            expect(Array.from(collectFormData(target).entries())).toEqual([["q", "fallback"]]);
        });
    });

    test("reads files exposed by form-associated controls", () => {
        const target = document.createElement("form");
        const control = document.createElement("upload-control") as HTMLElement & { name: string; files: File[] };
        control.setAttribute("name", "file");
        control.name = "file";
        control.files = [new File(["avatar"], "avatar.png", { type: "image/png" })];
        target.append(control);
        withEmptyFormData(() => {
            const entries = Array.from(collectFormData(target).entries());
            expect(entries).toHaveLength(1);
            expect(entries[0]?.[0]).toBe("file");
            const file: unknown = entries[0]?.[1];
            expect(file).toBeInstanceOf(File);
            if (!(file instanceof File)) {
                throw new Error("expected file entry");
            }
            expect(file.name).toBe("avatar.png");
        });
    });

    test("preserves repeated values exposed by a custom control", () => {
        const target = form(`<form><choice-group name="styles"></choice-group></form>`);
        const control = target.querySelector("choice-group") as HTMLElement & { name: string; value: string[] };
        control.name = "styles";
        control.value = ["attacking", "defensive"];
        withEmptyFormData(() => {
            expect(Array.from(collectFormData(target).entries())).toEqual([
                ["styles", "attacking"],
                ["styles", "defensive"],
            ]);
        });
    });

    test("serializes an explicit unchecked custom-control value", () => {
        const target = form(`<form><toggle-control name="notifications"></toggle-control></form>`);
        const control = target.querySelector("toggle-control") as HTMLElement & {
            name: string;
            value: string;
            checked: boolean;
            uncheckedValue: string;
        };
        control.name = "notifications";
        control.value = "true";
        control.checked = false;
        control.uncheckedValue = "false";
        withEmptyFormData(() => {
            expect(Array.from(collectFormData(target).entries())).toEqual([["notifications", "false"]]);
        });
    });
});
