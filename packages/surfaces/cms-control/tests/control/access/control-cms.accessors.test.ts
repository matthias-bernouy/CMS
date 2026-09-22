import { describe, expect, test } from "bun:test";
import { controlCmsAccessors } from "cms-control/core/admin/control/accessors";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

describe("ControlCms accessor delegation", () => {
    test("maps every directly injected dependency without substitution", () => {
        const dependency = {};
        const configuration = {};
        const state = {
            configuration,
            repository: dependency,
            auth: dependency,
            runner: dependency,
            cache: dependency,
            secrets: dependency,
            dashboards: dependency,
            identities: dependency,
            sourceOverlays: dependency,
        } as unknown as ControlCmsState;

        const expectations = [
            ["config", configuration],
            ["repository", dependency],
            ["auth", dependency],
            ["runner", dependency],
            ["cache", dependency],
            ["secrets", dependency],
            ["dashboards", dependency],
            ["identities", dependency],
            ["sourceOverlays", dependency],
        ] as const;

        for (const [name, expected] of expectations) {
            expect((controlCmsAccessors[name] as (value: ControlCmsState) => unknown)(state)).toBe(expected);
        }
    });
});
