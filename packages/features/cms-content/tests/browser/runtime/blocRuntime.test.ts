import { afterEach, describe, expect, test } from "bun:test";
import {
    BlocBehavior,
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    mountBlocBehavior,
} from "../../../src/browser/component/BlocBehavior";
import { registerBloc } from "../../../src/browser/component/BlocRuntime";
import { resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Light DOM Bloc runtime", () => {
    test("keeps behavior queries inside their owning Bloc", () => {
        document.body.innerHTML = `
            <section cms-bloc="test-parent">
                <span data-target="owned"></span>
                <div cms-bloc="test-child" data-target="child-root">
                    <span data-target="child-internal"></span>
                </div>
            </section>`;
        const root = document.querySelector<HTMLElement>('[cms-bloc="test-parent"]');
        if (!root) {
            throw new Error("Expected parent Bloc root");
        }
        let result: Readonly<{ target: string | undefined; count: number; child: string | null }> | undefined;
        class ProbeBehavior extends BlocBehavior {
            override connectedCallback(): void {
                result = {
                    target: this.querySelector<HTMLElement>("[data-target]")?.dataset.target,
                    count: this.querySelectorAll("[data-target]").length,
                    child: this.queryBlocRoot("test-child")?.getAttribute("data-target") ?? null,
                };
            }
        }

        mountBlocBehavior(root, ProbeBehavior);

        expect(result).toEqual({ target: "owned", count: 1, child: "child-root" });
    });

    test("connects a field to an explicitly exposed child Bloc control", () => {
        document.body.innerHTML = `
            <div cms-bloc="test-field">
                <label part="field-label">Email</label>
                <div part="field-description">Used to sign in</div>
                <div cms-bloc="test-input"><input type="email"></div>
            </div>`;
        const field = document.querySelector<HTMLElement>('[cms-bloc="test-field"]')!;
        const inputRoot = document.querySelector<HTMLElement>('[cms-bloc="test-input"]')!;
        class FieldBehavior extends BlocBehavior {
            override connectedCallback(): void {
                this.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.connectReady);
            }

            private connectReady = (event: Event): void => {
                if (event.target instanceof HTMLElement) {
                    this.connectBlocFormControl(event.target, {
                        label: this.querySelector<HTMLLabelElement>("label")!,
                        descriptions: this.querySelectorAll<HTMLElement>('[part="field-description"]'),
                    });
                }
            };
        }
        class InputBehavior extends BlocBehavior {}

        mountBlocBehavior(field, FieldBehavior);
        mountBlocBehavior(inputRoot, InputBehavior);

        const input = inputRoot.querySelector<HTMLInputElement>("input")!;
        expect(input.id).toMatch(/^ulvia-form-control-/u);
        expect(field.querySelector("label")?.htmlFor).toBe(input.id);
        expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-field-description`);
    });

    test("mounts existing roots once and installs one scoped style", () => {
        document.body.innerHTML = '<section cms-bloc="test-runtime-existing"></section>';
        let mounts = 0;
        registerBloc("test-runtime-existing", {
            style: '@scope ([cms-bloc="test-runtime-existing"]) { :scope { display: block; } }',
            mount: () => {
                mounts += 1;
            },
        });
        registerBloc("test-runtime-existing", {
            style: "ignored",
            mount: () => {
                mounts += 1;
            },
        });

        expect(mounts).toBe(1);
        expect(document.head.querySelectorAll('[data-cms-bloc-style="test-runtime-existing"]')).toHaveLength(1);
    });

    test("mounts inserted roots and cleans removed subtrees", async () => {
        let mounts = 0;
        let cleanups = 0;
        registerBloc("test-runtime-dynamic", {
            mount: () => {
                mounts += 1;
                return () => {
                    cleanups += 1;
                };
            },
        });

        const parent = document.createElement("div");
        parent.innerHTML = '<section cms-bloc="test-runtime-dynamic"></section>';
        document.body.append(parent);
        await waitFor(() => mounts === 1);
        parent.remove();
        await waitFor(() => cleanups === 1);

        expect({ mounts, cleanups }).toEqual({ mounts: 1, cleanups: 1 });
    });
});
