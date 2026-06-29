import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldProject } from "cms-cli/CLI_init";
import { buildAllDevBlocs } from "cms-cli/dev-server/build";
import { scanDevBlocs } from "cms-cli/dev-server/scan";

const starterEditableHtmlFiles = [
    ["site", "pages", "index.html"],
    ["site", "pages", "auth", "login.html"],
    ["site", "pages", "auth", "register.html"],
    ["site", "pages", "auth", "forgot-password.html"],
    ["site", "pages", "auth", "confirm-email.html"],
    ["site", "pages", "auth", "reset-password.html"],
    ["site", "pages", "annonces.html"],
    ["site", "pages", "articles.html"],
    ["site", "pages", "articles", "launching-a-content-workflow.html"],
    ["site", "pages", "articles", "designing-flexible-pages.html"],
    ["site", "pages", "articles", "preparing-auth-screens.html"],
    ["site", "snippets", "Layout", "navbar.html"],
    ["site", "snippets", "Layout", "footer.html"],
    ["site", "templates", "Layout", "basic-page.html"],
    ["site", "templates", "Pages", "article.html"],
] as const;

function tempRoot(): string {
    return mkdtempSync(join(tmpdir(), "p9r-init-"));
}

describe("p9r init", () => {
    test("scaffolds a complete CMS site project", async () => {
        const cwd = tempRoot();
        const { target, template } = await scaffoldProject({
            cwd,
            folder:   "demo-site",
            template: "full",
            force:    false,
        });

        expect(template).toBe("full");
        expect(JSON.parse(await readFile(join(target, "package.json"), "utf-8")).name).toBe("demo-site");
        expect(existsSync(join(target, "p9r.config.json"))).toBe(true);
        expect(existsSync(join(target, "site", "system.json"))).toBe(true);
        expect(existsSync(join(target, "site", "theme.css"))).toBe(true);
        expect(existsSync(join(target, "site", "integrations", ".gitkeep"))).toBe(true);
        expect(existsSync(join(target, "site", ".p9r", "generated", "sources", ".gitkeep"))).toBe(true);
        expect(existsSync(join(target, "site", "pages", "index.html"))).toBe(true);
        for (const file of starterEditableHtmlFiles) {
            expect(existsSync(join(target, ...file))).toBe(true);
        }

        const theme = await readFile(join(target, "site", "theme.css"), "utf-8");
        expect(theme).toContain("--bg-surface");
        expect(theme).toContain("--p9r-space-md");
        expect(theme).toContain("--p9r-container-lg");
        expect(theme).toContain("--p9r-radius-md");
        expect(theme).toContain("--font-body");
        expect(theme).toContain("--duration-quick");
        expect(theme).not.toMatch(/(^|[\s,{])(?:base-[a-z0-9-]+|cms-[a-z0-9-]+|w13c-[a-z0-9-]+)/);

        const containerCss = await readFile(join(target, "site", "blocs", "Layout", "base-container", "style.css"), "utf-8");
        expect(containerCss).toContain("min-height: var(--_min-height)");
        expect(containerCss).toContain("padding: var(--_padding-block) var(--_padding-inline)");
        expect(containerCss).toContain("background: var(--_background)");
        expect(containerCss).toContain("border-radius: var(--_radius)");
        expect(containerCss).toContain("max-width: var(--_max-width)");
        expect(containerCss).toContain("justify-content: var(--_vertical-align)");
        expect(containerCss).toContain(`:host([vertical-align="start"])`);
        expect(containerCss).not.toContain("::slotted(h1");
        expect(containerCss).not.toContain("::slotted(h2");
        expect(containerCss).not.toContain("::slotted(h3");
        expect(containerCss).not.toContain("::slotted(p");

        const cardCss = await readFile(join(target, "site", "blocs", "Layout", "base-card", "style.css"), "utf-8");
        expect(cardCss).toContain(".header ::slotted(h1)");
        expect(cardCss).toContain(".header ::slotted(img)");
        expect(cardCss).toContain(".footer ::slotted(a)");
        expect(cardCss).toContain(`:host([fill-height])`);

        const cardEditor = await readFile(join(target, "site", "blocs", "Layout", "base-card", "BlocEditor.ts"), "utf-8");
        expect(cardEditor).toContain(`label: "Fill height"`);
        expect(cardEditor).toContain(`attribute: "fill-height"`);

        const gridCss = await readFile(join(target, "site", "blocs", "Layout", "base-grid", "style.css"), "utf-8");
        expect(gridCss).toContain("align-items: var(--item-align)");
        expect(gridCss).toContain(`:host([item-align="stretch"])`);
        expect(gridCss).toContain("max-width: var(--max)");
        expect(gridCss).toContain(`:host([max="sm"])`);
        expect(gridCss).not.toContain(`mode="columns"`);

        const gridEditor = await readFile(join(target, "site", "blocs", "Layout", "base-grid", "BlocEditor.ts"), "utf-8");
        expect(gridEditor).toContain(`label: "Maximum item width"`);
        expect(gridEditor).toContain(`attribute: "max"`);
        expect(gridEditor).toContain(`label: "Item align"`);
        expect(gridEditor).toContain(`attribute: "item-align"`);
        expect(gridEditor).not.toContain(`label: "Columns"`);

        const formEditor = await readFile(join(target, "site", "blocs", "Form", "base-form", "BlocEditor.ts"), "utf-8");
        expect(formEditor).toContain(`type: "endpoint-picker"`);
        expect(formEditor).toContain(`attribute: "endpoint"`);
        expect(formEditor).toContain(`methodAttribute: "method"`);

        const formDefault = await readFile(join(target, "site", "blocs", "Form", "base-form", "default.html"), "utf-8");
        expect(formDefault).toContain(`<base-search-input name="search" placeholder="Search">`);
        expect(formDefault).toContain(`<option value="First suggestion"></option>`);
        expect(formDefault).not.toContain(`<datalist`);

        const formBloc = await readFile(join(target, "site", "blocs", "Form", "base-form", "Bloc.ts"), "utf-8");
        expect(formBloc).toContain(`fetch(endpoint, init)`);
        expect(formBloc).toContain(`this.addEventListener("click", this._onClick)`);
        expect(formBloc).toContain(`this.addEventListener("keydown", this._onKeyDown)`);
        expect(formBloc).toContain(`FORM_SUCCESS_EVENT`);
        expect(formBloc).toContain(`FORM_ERROR_EVENT`);

        const searchInputEditor = await readFile(join(target, "site", "blocs", "Form", "base-search-input", "BlocEditor.ts"), "utf-8");
        expect(searchInputEditor).toContain(`label: "Options"`);
        expect(searchInputEditor).toContain(`tag: "option"`);

        const searchInputBloc = await readFile(join(target, "site", "blocs", "Form", "base-search-input", "Bloc.ts"), "utf-8");
        expect(searchInputBloc).toContain(`static formAssociated = true`);
        expect(searchInputBloc).toContain(`querySelectorAll("option")`);

        const searchInputCss = await readFile(join(target, "site", "blocs", "Form", "base-search-input", "style.css"), "utf-8");
        expect(searchInputCss).not.toContain(`:host([has-status]) .field`);
        expect(searchInputCss).toContain(`.options-slot {\n    display: contents;`);
        expect(searchInputCss).toContain(`::slotted(option)`);

        const loginPage = await readFile(join(target, "site", "pages", "auth", "login.html"), "utf-8");
        expect(loginPage).toContain(`<base-form endpoint="/.cms/auth/login" method="POST" redirect="/">`);

        const listingsPage = await readFile(join(target, "site", "pages", "annonces.html"), "utf-8");
        expect(listingsPage).toContain(`title: Annonces`);
        expect(listingsPage).toContain(`<base-grid min="sm" max="sm" gap="lg" item-align="stretch">`);
        expect(listingsPage).toContain(`<base-card padding="md" variant="elevated" interactive fill-height>`);
        expect(listingsPage).toContain(`Blade 98 v9`);
        expect(listingsPage).toContain(`Pure Aero Team`);
        expect(listingsPage).toContain(`Voir l'annonce`);
        expect(listingsPage).toContain(`data:image/svg+xml`);

        const registerPage = await readFile(join(target, "site", "pages", "auth", "register.html"), "utf-8");
        expect(registerPage).toContain(`<base-form endpoint="/.cms/auth/signup" method="POST" redirect="/auth/login">`);
        expect(registerPage).toContain(`name="displayName"`);

        const forgotPasswordPage = await readFile(join(target, "site", "pages", "auth", "forgot-password.html"), "utf-8");
        expect(forgotPasswordPage).toContain(`<base-form endpoint="/.cms/auth/password/reset/request" method="POST" redirect="/auth/login">`);

        const confirmEmailPage = await readFile(join(target, "site", "pages", "auth", "confirm-email.html"), "utf-8");
        expect(confirmEmailPage).toContain(`<base-form endpoint="/.cms/auth/email/verification/confirm" method="POST" redirect="/auth/login">`);

        const resetPasswordPage = await readFile(join(target, "site", "pages", "auth", "reset-password.html"), "utf-8");
        expect(resetPasswordPage).toContain(`<base-form endpoint="/.cms/auth/password/reset/confirm" method="POST" redirect="/auth/login">`);

        const blocs = await scanDevBlocs(join(target, "site", "blocs"), { quiet: true });
        expect(blocs.map(bloc => bloc.tag).sort()).toEqual([
            "base-card",
            "base-container",
            "base-footer",
            "base-footer-column",
            "base-form",
            "base-grid",
            "base-horizontal-navbar",
            "base-nav-item",
            "base-photo-album",
            "base-search-input",
            "base-skeleton",
        ]);

        const byTag = Object.fromEntries(blocs.map(bloc => [bloc.tag, bloc]));
        expect(byTag["base-card"]?.group).toBe("Layout");
        expect(byTag["base-form"]?.group).toBe("Form");
        expect(byTag["base-search-input"]?.group).toBe("Form");
        expect(byTag["base-footer"]?.group).toBe("Navigation");
        expect(byTag["base-horizontal-navbar"]?.group).toBe("Navigation");
        expect(byTag["base-photo-album"]?.group).toBe("Media");
        expect(byTag["base-skeleton"]?.group).toBe("Feedback");

        const built = await buildAllDevBlocs(blocs);
        expect(built.size).toBe(11);

        for (const file of starterEditableHtmlFiles) {
            const html = await readFile(join(target, ...file), "utf-8");

            expect(html).not.toMatch(/<\/?(main|section|article|div|form|label|button|strong|small|header|footer)\b/i);
            expect(html).not.toMatch(/\sclass=/i);
            expect(html).not.toMatch(/\sstyle=/i);
            expect(html).not.toMatch(/<script\b/i);
        }
    });

    test("refuses a non-empty target unless force is enabled", async () => {
        const cwd = tempRoot();
        const target = join(cwd, "demo-site");
        mkdirSync(target);
        writeFileSync(join(target, "keep.txt"), "keep");

        await expect(scaffoldProject({
            cwd,
            folder:   "demo-site",
            template: "full",
            force:    false,
        })).rejects.toThrow("already exists and is not empty");

        await scaffoldProject({
            cwd,
            folder:   "demo-site",
            template: "full",
            force:    true,
        });

        expect(existsSync(join(target, "package.json"))).toBe(true);
        expect(existsSync(join(target, "keep.txt"))).toBe(true);
    });

    test("rejects unknown templates", async () => {
        await expect(scaffoldProject({
            cwd:      tempRoot(),
            folder:   "demo-site",
            template: "unknown",
            force:    false,
        })).rejects.toThrow("Unknown template");
    });

    test("does not expose p9r new", async () => {
        const cli = join(import.meta.dir, "..", "src", "index.ts");
        const process = Bun.spawn({
            cmd:    ["bun", cli, "new", "demo-site"],
            cwd:    tempRoot(),
            stdout: "pipe",
            stderr: "pipe",
        });

        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(process.stdout).text(),
            new Response(process.stderr).text(),
            process.exited,
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toContain("Unknown command: new");
        expect(stdout).not.toContain("p9r new");
    });
});
