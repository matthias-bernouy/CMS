import { expect, test } from "bun:test";
import { defaultSystem, type PageRoute, type TPage, type TSystem } from "@bernouy/cms-content";
import { resolvePublishedRoute } from "cms-content/pages/core/queries/resolvePublishedRoute";

function fixture() {
    const system = defaultSystem();
    system.site.language = "en";
    const page: TPage = {
        id: "one",
        path: "/one",
        content: "Published",
        title: "One",
        description: "",
        tags: [],
        visible: true,
    };
    const route: PageRoute = { path: "/one", pageId: "one", ownerPageId: "one", language: "en", state: "current" };
    let routeReads = 0;
    let settingsReads = 0;
    const trace: string[] = [];
    const changes: { route?: PageRoute | null; system?: TSystem; missingRoute?: boolean } = {};
    const repository = {
        getSystem: async () => {
            trace.push("settings");
            return settingsReads++ ? (changes.system ?? system) : system;
        },
        getPageRoute: async () => {
            trace.push("route");
            if (changes.missingRoute) {
                return null;
            }
            return routeReads++ && "route" in changes ? changes.route! : route;
        },
        getPageById: async () => {
            trace.push("page");
            return page;
        },
    };
    return { repository, changes, trace, page, route, system };
}

test("published route resolution keeps its existing ordered reread protocol", async () => {
    const { repository, trace } = fixture();
    expect((await resolvePublishedRoute("/one", repository))?.kind).toBe("current");
    expect(trace).toEqual(["settings", "route", "page", "route", "settings"]);
});

test("route deletion or reassignment between reads produces updating, never the previously read page", async () => {
    for (const target of [null, "two"]) {
        const { repository, changes, route } = fixture();
        changes.route = target ? { ...route, pageId: target } : null;
        expect(await resolvePublishedRoute("/one", repository)).toEqual({ kind: "updating" });
    }
});

test("a language change or migration flag on the second settings read produces updating", async () => {
    for (const migration of [false, true]) {
        const { repository, changes, system } = fixture();
        changes.system = structuredClone(system);
        if (migration) {
            changes.system.pageRoutesUpdating = true;
        } else {
            changes.system.site.language = "fr";
        }
        expect(await resolvePublishedRoute("/one", repository)).toEqual({ kind: "updating" });
    }
});

test("a missing route is not reported absent during a detected language migration", async () => {
    const { repository, changes, system } = fixture();
    changes.missingRoute = true;
    changes.system = { ...system, pageRoutesUpdating: true };
    expect(await resolvePublishedRoute("/one", repository)).toEqual({ kind: "updating" });
});

test("an unpublished page remains unavailable after stable route and settings reads", async () => {
    const { repository, page } = fixture();
    page.visible = false;
    expect(await resolvePublishedRoute("/one", repository)).toEqual({ kind: "unavailable" });
});
