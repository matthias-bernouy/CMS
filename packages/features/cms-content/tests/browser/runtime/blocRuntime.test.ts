import { afterEach, describe, expect, test } from "bun:test";
import { registerBloc } from "../../../src/browser/component/BlocRuntime";
import { resetDom, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Light DOM Bloc runtime", () => {
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
