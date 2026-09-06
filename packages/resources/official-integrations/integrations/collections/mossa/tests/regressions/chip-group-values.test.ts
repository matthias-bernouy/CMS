import { File } from "node:buffer";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const originalAttachInternals = HTMLElement.prototype.attachInternals;
const groupTag = "test-mossa-chip-group-values";
let submitted: FormData | string | null = null;
let validity: ValidityStateFlags = {};

beforeAll(async () => {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    for (const tag of ["mossa-chip", "mossa-chip-group"]) {
        const outputTag = tag === "mossa-chip-group" ? groupTag : tag;
        if (customElements.get(outputTag)) {
            continue;
        }
        const artifact = definition?.artifacts?.find((item) => item.type === "bloc" && item.bloc.tag === tag);
        if (artifact?.type !== "bloc") {
            throw new Error(`Missing ${tag}`);
        }
        const bloc = artifact.bloc;
        const compiled = await prepare_bloc(
            new File([bloc.viewJS!], "Bloc.ts"),
            new File([bloc.editorJS!], "BlocEditor.ts"),
            bloc.name,
            "Forms",
            bloc.description ?? "",
            outputTag,
            bloc.source,
        );
        new Function(compiled.viewJS)();
    }
});

afterEach(() => {
    document.body.replaceChildren();
    HTMLElement.prototype.attachInternals = originalAttachInternals;
    submitted = null;
    validity = {};
});

test("submits an explicit empty value when the last selected chip is cleared", () => {
    const group = mount('mode="multiple" unchecked-value=""');
    toggle(group, "wilson");
    toggle(group, "head");
    expect((submitted as FormData | null)?.getAll("brands")).toEqual(["wilson", "head"]);
    toggle(group, "head");
    expect((submitted as FormData | null)?.getAll("brands")).toEqual(["wilson"]);
    toggle(group, "wilson");
    expect(submitted).toBe("");
    expect(validity).toEqual({});
});

test("preserves omission by default and never submits disabled or unnamed groups", () => {
    const group = mount('mode="multiple"');
    expect(submitted).toBeNull();
    group.setAttribute("unchecked-value", "cleared");
    expect(submitted).toBe("cleared");
    group.setAttribute("disabled", "");
    expect(submitted).toBeNull();
    group.removeAttribute("disabled");
    expect(submitted).toBe("cleared");
    group.removeAttribute("name");
    expect(submitted).toBeNull();
});

test("retains required validation even when an unchecked value is configured", () => {
    mount('mode="multiple" unchecked-value="" required');
    expect(submitted).toBe("");
    expect(validity).toEqual({ valueMissing: true });
});

function mount(attributes: string): HTMLElement {
    HTMLElement.prototype.attachInternals = function () {
        if (this.localName !== groupTag) {
            return originalAttachInternals.call(this);
        }
        return {
            setFormValue(value: FormData | string | null) {
                submitted = value;
            },
            setValidity(value: ValidityStateFlags) {
                validity = value;
            },
        } as unknown as ElementInternals;
    };
    document.body.innerHTML = `<${groupTag} name="brands" ${attributes}>
        <mossa-chip value="wilson">Wilson</mossa-chip><mossa-chip value="head">Head</mossa-chip>
    </${groupTag}>`;
    return document.body.firstElementChild as HTMLElement;
}

function toggle(group: HTMLElement, value: string): void {
    group
        .querySelector(`mossa-chip[value="${value}"]`)!
        .dispatchEvent(new CustomEvent("mossa-chip:toggle", { bubbles: true, composed: true }));
}
