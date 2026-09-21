import { describe, expect, mock, test } from "bun:test";
import { defaultSystem, P9R_CACHE } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { getSettings } from "cms-control/core/management/settings/getSettings";
import { updateSettings } from "cms-control/core/management/settings/updateSettings";

describe("settings runtime", () => {
    test("combines system settings with page choices", async () => {
        const system = defaultSystem();
        const pages = [{ path: "/about", title: "About" }];
        const getSystem = mock(async () => system);
        const getLinks = mock(async () => pages);
        const cms = {
            repository: { getSystem, getLinks },
        } as unknown as ControlCms;

        const settings = await getSettings(cms);

        expect(settings).toEqual({
            site: system.site,
            theme: system.theme,
            security: system.security,
            email: system.email,
            pages,
        });
        expect(getSystem).toHaveBeenCalledTimes(1);
        expect(getLinks).toHaveBeenCalledTimes(1);
    });

    test("persists updates and invalidates style and rendered page caches", async () => {
        const updateSystem = mock(async () => defaultSystem());
        const deleteKey = mock((_key: string) => {});
        const deleteMatching = mock((predicate: (key: string) => boolean) => {
            expect(predicate("page:/about")).toBe(true);
            expect(predicate("bloc:hero")).toBe(false);
        });
        const cms = {
            repository: { updateSystem },
            cache: { delete: deleteKey, deleteMatching },
        } as unknown as ControlCms;
        const update = { initializationStep: 2 };

        await updateSettings(cms, update);

        expect(updateSystem).toHaveBeenCalledWith(update);
        expect(deleteKey).toHaveBeenCalledWith(P9R_CACHE.STYLE);
        expect(deleteMatching).toHaveBeenCalledTimes(1);
    });
});
