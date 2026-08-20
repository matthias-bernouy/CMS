import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

    test("limits theme CSS to shared tokens and three semantic typography rules", () => {
        const theme = readSiteFile("theme.css");
        const rootRule = theme.match(/^:root\s*\{([^}]*)\}/u);

        expect(rootRule).not.toBeNull();
        expect(rootRule![1]!.split(";").filter((value) => value.trim() && !value.trim().startsWith("--"))).toEqual([]);
        expect(theme).not.toMatch(/@import|url\s*\(|(^|[},])\s*\.[a-z_-][\w-]*/imu);
        const selectors = [...theme.slice(rootRule![0]!.length).matchAll(/([^{}]+)\{[^{}]*\}/gu)].map((match) =>
            match[1]!.trim(),
        );
        expect(selectors).toEqual([":where(h1, h2, h3)", ":where(h2)", ":where(blockquote)"]);
    });
});
