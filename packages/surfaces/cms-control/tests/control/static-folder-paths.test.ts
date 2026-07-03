import { describe, expect, test } from "bun:test";
import { toRoutePath } from "cms-control/core/registerEndpoints/serveApiFolder";
import { toRouteRelativePath } from "cms-control/core/registerEndpoints/serveStaticFolder/scanStaticFolder";

describe("file-backed route paths", () => {
    test("normalizes Windows path separators before route registration", () => {
        expect(toRouteRelativePath("admin\\pages.html")).toBe("admin/pages.html");
        expect(toRouteRelativePath("assets\\control-components.js")).toBe("assets/control-components.js");
        expect(toRoutePath("page\\exists")).toBe("page/exists");
    });

    test("keeps POSIX paths unchanged", () => {
        expect(toRouteRelativePath("admin/pages.html")).toBe("admin/pages.html");
        expect(toRoutePath("page/exists")).toBe("page/exists");
    });
});
