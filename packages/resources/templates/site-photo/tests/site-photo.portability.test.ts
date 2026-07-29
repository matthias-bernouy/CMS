import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_PHOTO_TEMPLATE_ROOT, SITE_PHOTO_TEMPLATE_SITE_ROOT } from "../../index";

const readSiteFile = (path: string): string => readFileSync(join(SITE_PHOTO_TEMPLATE_SITE_ROOT, path), "utf8");

describe("site-photo template portability", () => {
    test("passes its reusable template check", () => {
        const result = Bun.spawnSync(["bun", "check-template.ts"], {
            cwd: SITE_PHOTO_TEMPLATE_ROOT,
            stderr: "pipe",
            stdout: "pipe",
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toContain("Template contract valid: 9 pages");
    });

    test("blocks publication while canonical and legal values are placeholders", () => {
        const result = Bun.spawnSync(["bun", "check-template.ts", "--publish"], {
            cwd: SITE_PHOTO_TEMPLATE_ROOT,
            stderr: "pipe",
            stdout: "pipe",
        });
        expect(result.exitCode).toBe(1);
        expect(result.stderr.toString()).toContain("PUBLISH BLOCKER");
        expect(result.stderr.toString()).toContain("canonical site.host");
        expect(result.stderr.toString()).toContain("template placeholders");
    });

    test("keeps authored pages declarative and self-contained", () => {
        for (const name of [
            "404.html",
            "a-propos.html",
            "albums.html",
            "contact.html",
            "index.html",
            "informations/confidentialite.html",
            "informations/cookies.html",
            "informations/mentions-legales.html",
            "photo-album.html",
        ]) {
            const body = readSiteFile(`pages/${name}`);
            expect(body).not.toMatch(/<script\b|<iframe\b|javascript:|fetch\s*\(/iu);
            expect(body).not.toMatch(/<(?:img|script|iframe)\b[^>]+\bsrc="https?:/iu);
            expect(body).not.toMatch(/\s(?:class|style)=/u);
        }
    });

    test("uses Photo Albums bindings and responsive image metadata", () => {
        for (const name of ["index.html", "albums.html"]) {
            const body = readSiteFile(`pages/${name}`);
            expect(body).toContain("<photo-album-list");
            expect(body).toContain('cms-repeat="data.items as album"');
            expect(body).toContain('data-photo-source-url="publicPhoto"');
            expect(body).toContain('data-source-image-access="public"');
            expect(body).toContain("data-source-width=");
            expect(body).toContain("data-source-height=");
        }

        const detail = readSiteFile("pages/photo-album.html");
        expect(detail).toContain("<photo-album-gallery");
        expect(detail).toContain('slug-param="slug"');
        expect(detail).toContain('cms-repeat="data.photos as photo"');
        expect(detail).toContain("data-photo-grid");
    });

    test("keeps the eager cover bounded and local", () => {
        const home = readSiteFile("pages/index.html");
        expect(home).toContain('src="/.cms/files/by-id/019f9a04-31a1-7000-b7a3-994a75a9120d"');
        expect(home).toContain('width="1122"');
        expect(home).toContain('height="1402"');
        expect(home).toContain('sizes="(max-width: 48rem)');
        expect(home).toContain('loading="eager"');
    });

    test("does not load remote theme assets", () => {
        const theme = readSiteFile("theme.css");
        expect(theme).not.toMatch(/@import|url\s*\(\s*["']?https?:/iu);
        expect(theme).not.toMatch(/^\s*\.[-_a-z]/imu);
    });
});
