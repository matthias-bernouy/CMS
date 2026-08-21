import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SITE_TEMPLATE_ROOT = join(import.meta.dir, "..");
const DEFAULT_SITE_TEMPLATE_SITE_ROOT = join(DEFAULT_SITE_TEMPLATE_ROOT, "site");
const readSiteFile = (path: string): string => readFileSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, path), "utf8");

describe("default-site template portability", () => {
    test("passes its reusable template check", () => {
        const result = Bun.spawnSync(["bun", "check-template.ts"], {
            cwd: DEFAULT_SITE_TEMPLATE_ROOT,
            stderr: "pipe",
            stdout: "pipe",
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toContain("Default template contract valid: 4 block-only pages");
    });

    test("keeps authored pages declarative and class-free", () => {
        for (const name of ["404.html", "about.html", "contact.html", "index.html"]) {
            const body = readSiteFile(`pages/${name}`);
            expect(body).not.toMatch(/\b(?:class|style)=/iu);
            expect(body).not.toMatch(/<script\b|<iframe\b|javascript:|fetch\s*\(/iu);
            expect(body).not.toMatch(/<(?:img|script|iframe)\b[^>]+\bsrc="https?:/iu);
        }
    });

    test("delegates the complete design system to Basic Blocs", () => {
        expect(existsSync(join(DEFAULT_SITE_TEMPLATE_SITE_ROOT, "theme.css"))).toBeFalse();
        expect(JSON.parse(readSiteFile("system.json"))).not.toHaveProperty("theme");
    });
});
