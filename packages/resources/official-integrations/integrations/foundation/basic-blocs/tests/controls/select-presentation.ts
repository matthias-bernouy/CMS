import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerSelectPresentationTest(): void {
    test("select adapts its native and custom presentations without duplicating state or events", async () => {
        if (!customElements.get("basic-select") || !customElements.get("basic-option")) {
            const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
            const definition = await repo.get("basic-blocs");
            const artifacts =
                definition?.artifacts?.filter(
                    (artifact) =>
                        artifact.type === "bloc" && ["basic-option", "basic-select"].includes(artifact.bloc.tag),
                ) ?? [];
            for (const artifact of artifacts) {
                if (artifact.type !== "bloc" || customElements.get(artifact.bloc.tag)) {
                    continue;
                }
                const bloc = artifact.bloc;
                const built = await prepare_bloc(
                    new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                    new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
                    bloc.name,
                    bloc.group ?? "",
                    bloc.description ?? "",
                    bloc.tag,
                    bloc.source,
                    decodeDefaultContent(bloc.source),
                );
                new Function(built.viewJS)();
            }
        }

        const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
        let matches = true;
        let changeListener: ((event: Event) => void) | undefined;
        const query = {
            get matches() {
                return matches;
            },
            media: "(hover: none) and (pointer: coarse)",
            onchange: null,
            addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
                if (type === "change" && typeof listener === "function") {
                    changeListener = listener;
                }
            },
            removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
                if (type === "change" && listener === changeListener) {
                    changeListener = undefined;
                }
            },
            addListener: (listener: (event: Event) => void) => {
                changeListener = listener;
            },
            removeListener: (listener: (event: Event) => void) => {
                if (listener === changeListener) {
                    changeListener = undefined;
                }
            },
            dispatchEvent: () => true,
        } as unknown as MediaQueryList;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: () => query,
        });

        type AdaptiveSelect = HTMLElement & {
            value: string | string[];
            internals: ElementInternals;
        };
        const select = document.createElement("basic-select") as AdaptiveSelect;
        const makeOption = (value: string, label: string) => {
            const option = document.createElement("basic-option");
            option.setAttribute("value", value);
            option.textContent = label;
            return option;
        };
        select.setAttribute("label", "Brand");
        select.setAttribute("name", "brand");
        select.setAttribute("required", "");
        select.append(makeOption("", "All brands"), makeOption("head", "Head"));

        try {
            document.body.append(select);
            await Promise.resolve();

            const root = select.shadowRoot;
            const customShell = root?.querySelector<HTMLElement>(".custom-shell");
            const nativeShell = root?.querySelector<HTMLElement>(".native-shell");
            const customControl = root?.querySelector<HTMLButtonElement>(".control");
            const nativeControl = root?.querySelector<HTMLSelectElement>(".native-control");
            expect(nativeControl?.tagName).toBe("SELECT");
            expect(nativeControl?.getAttribute("part")).toBe("control native-control");
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(customShell?.hidden).toBe(true);
            expect(nativeShell?.hidden).toBe(false);
            expect(customControl?.disabled).toBe(true);
            expect(nativeControl?.disabled).toBe(false);
            expect(nativeControl?.value).toBe("");

            let hostChanges = 0;
            let hostInputs = 0;
            select.addEventListener("change", () => hostChanges++);
            select.addEventListener("input", () => hostInputs++);
            if (nativeControl) {
                nativeControl.value = "head";
                nativeControl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
                nativeControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
            expect(hostInputs).toBe(0);
            expect(hostChanges).toBe(1);
            expect(select.value).toBe("head");
            expect(root?.querySelector(".value")?.textContent).toBe("Head");

            select.value = "future";
            expect(nativeControl?.options[0]?.hidden).toBe(true);
            expect(nativeControl?.options[0]?.disabled).toBe(true);
            expect(nativeControl?.options[1]?.textContent).toBe("All brands");
            expect(root?.querySelector(".value")?.textContent).toBe("Select an option");
            select.append(makeOption("future", "Future"));
            await Promise.resolve();
            await Promise.resolve();
            expect(select.value).toBe("future");
            expect(nativeControl?.value).toBe("future");
            expect(root?.querySelector(".value")?.textContent).toBe("Future");

            select.value = "missing";
            let validityAnchorClass = "";
            select.internals.setValidity = (_flags, _message, anchor) => {
                validityAnchorClass = anchor?.className || "";
            };
            nativeControl?.focus();
            matches = false;
            changeListener?.(new Event("change"));
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            expect(customShell?.hidden).toBe(false);
            expect(nativeShell?.hidden).toBe(true);
            expect(root?.activeElement?.className).toBe("control");
            expect(validityAnchorClass).toBe("control");

            customControl?.focus();
            matches = true;
            changeListener?.(new Event("change"));
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(root?.activeElement?.className).toBe("native-control");
            expect(validityAnchorClass).toBe("native-control");

            select.setAttribute("presentation", "custom");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            customControl?.click();
            root?.querySelector<HTMLButtonElement>(".option")?.focus();
            select.setAttribute("presentation", "native");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(root?.activeElement?.className).toBe("native-control");

            select.removeAttribute("presentation");
            select.setAttribute("multiple", "");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            expect(nativeControl?.multiple).toBe(true);
            select.setAttribute("presentation", "native");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(nativeControl?.multiple).toBe(true);
            let submittedValue: string | FormData | null = null;
            select.internals.setFormValue = (value) => {
                submittedValue = value;
            };
            if (nativeControl) {
                for (const option of nativeControl.options) {
                    option.selected = ["head", "future"].includes(option.value);
                }
                nativeControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
            expect(select.value).toEqual(["head", "future"]);
            expect(submittedValue instanceof FormData).toBe(true);
            expect((submittedValue as FormData).getAll("brand")).toEqual(["head", "future"]);
        } finally {
            select.remove();
            if (matchMediaDescriptor) {
                Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
            } else {
                Reflect.deleteProperty(window, "matchMedia");
            }
        }
    });
}
