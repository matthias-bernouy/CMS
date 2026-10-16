import { afterEach, describe, expect, test } from "bun:test";
import { createBlocScope, observeBlocAttributes } from "../../../src/browser/component/Bloc";
import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
} from "../../../src/browser/component/BlocFormControl";
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
        const scope = createBlocScope(root);
        result = {
            target: scope.querySelector<HTMLElement>("[data-target]")?.dataset.target,
            count: scope.querySelectorAll("[data-target]").length,
            child: scope.queryBlocRoot("test-child")?.getAttribute("data-target") ?? null,
        };

        expect(result).toEqual({ target: "owned", count: 1, child: "child-root" });
    });

    test("connects a field to an explicitly exposed child Bloc control", () => {
        document.body.innerHTML = `
            <div cms-bloc="test-field">
                <label part="field-label">Email</label>
                <div part="field-description">Used to sign in</div>
                <div cms-bloc="test-input"><input type="email"></div>
            </div>`;
        registerBloc("test-field", {
            mount: (root) => {
                const scope = createBlocScope(root);
                const connectReady = (event: Event): void => {
                    if (event.target instanceof HTMLElement) {
                        connectBlocFormControl(event.target, {
                            label: scope.querySelector<HTMLLabelElement>("label")!,
                            descriptions: scope.querySelectorAll<HTMLElement>('[part="field-description"]'),
                        });
                    }
                };
                root.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, connectReady);
                return () => root.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, connectReady);
            },
        });
        registerBloc("test-input", {});

        const field = document.querySelector<HTMLElement>('[cms-bloc="test-field"]')!;
        const inputRoot = document.querySelector<HTMLElement>('[cms-bloc="test-input"]')!;
        const input = inputRoot.querySelector<HTMLInputElement>("input")!;
        expect(input.id).toMatch(/^ulvia-form-control-/u);
        expect(field.querySelector("label")?.htmlFor).toBe(input.id);
        expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-field-description`);
    });

    test("observes only declared attributes and stops after cleanup", async () => {
        const root = document.createElement("section");
        const changes: string[] = [];
        const cleanup = observeBlocAttributes(root, ["open"], (name) => changes.push(name));

        root.setAttribute("ignored", "yes");
        root.setAttribute("open", "");
        await Promise.resolve();
        expect(changes).toEqual(["open"]);

        cleanup();
        root.removeAttribute("open");
        await Promise.resolve();
        expect(changes).toEqual(["open"]);
    });

    test("mounts existing roots once", () => {
        document.body.innerHTML = '<section cms-bloc="test-runtime-existing"></section>';
        let mounts = 0;
        registerBloc("test-runtime-existing", {
            mount: () => {
                mounts += 1;
            },
        });
        registerBloc("test-runtime-existing", {
            mount: () => {
                mounts += 1;
            },
        });

        expect(mounts).toBe(1);
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
