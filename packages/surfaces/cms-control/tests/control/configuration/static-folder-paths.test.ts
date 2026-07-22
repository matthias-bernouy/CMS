import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveRoute, serveApi, toRoutePath } from "cms-control/core/admin/registerEndpoints/serveApiFolder";
import replaceBasePath from "cms-control/core/admin/registerEndpoints/serveStaticFolder/replaceBasePath";
import {
    publicStaticPath,
    toRouteRelativePath,
} from "cms-control/core/admin/registerEndpoints/serveStaticFolder/scanStaticFolder";

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

    test("removes organizational segments without changing public routes", () => {
        expect(deriveRoute("_content/page/page")).toBe("page");
        expect(deriveRoute("_access/roles/roles")).toBe("roles");
        expect(publicStaticPath("admin/_content/pages.html")).toBe("admin/pages.html");
        expect(publicStaticPath("admin/_access/users.html")).toBe("admin/users.html");
    });

    test("replaces static base-path placeholders for root and mounted runners", () => {
        expect(replaceBasePath("{{BASE_PATH}}/admin", "/")).toBe("/admin");
        expect(replaceBasePath("{{BASE_PATH}}/admin", "/cms")).toBe("/cms/admin");
    });

    test("rejects API files that collapse onto the same public route", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-control-routes-"));
        try {
            await mkdir(join(root, "_content"));
            await writeFile(join(root, "_content/page.get.ts"), "export default function page() {}\n");
            await writeFile(join(root, "page.get.ts"), "export default function page() {}\n");

            await expect(serveApi({} as never, root, {})).rejects.toThrow(/Conflict: GET \/page declared in both/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
