import { expect, test } from "bun:test";
import { fixture } from "./fixture";

const selection = (f: Awaited<ReturnType<typeof fixture>>) =>
    f.integrationInstallations.get("gallery").then((i) => i!.activeResources);
const choice = (f: Awaited<ReturnType<typeof fixture>>, name: string) =>
    f.page.locator(`cms-bloc-choice[resource="gallery/blocs/${name}"] w13c-switch`);

test("switches save immediately and failed requests restore availability with retry", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=managed:gallery");
        f.failures.set("/api/bloc/collections/availability", "Maintenance, please retry");
        await choice(f, "card").click();
        await f.page.locator("p9r-toast").filter({ hasText: "Maintenance, please retry" }).waitFor();
        expect(await choice(f, "card").evaluate((el) => (el as HTMLElement & { checked: boolean }).checked)).toBe(true);
        await f.page.getByRole("button", { name: "Retry saving", exact: true }).click();
        await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await selection(f)).toEqual(["gallery/blocs/retained"]);
        expect(f.writes.filter((w) => w.path === "/api/bloc/collections/availability").map((w) => w.body)).toEqual([
            { id: "gallery", resource: "gallery/blocs/card", active: "false" },
            { id: "gallery", resource: "gallery/blocs/card", active: "false" },
        ]);
        expect(await f.page.getByRole("button", { name: "Save changes", exact: true }).count()).toBe(0);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

test("rapid switches preserve the latest intent across filtering while requests run sequentially", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    try {
        await f.goto("?collection=managed:gallery");
        f.state.availabilityDelay = () => gate;
        await choice(f, "card").click();
        await f.page.locator("p9r-toast").filter({ hasText: "Saving availability…" }).waitFor();
        await choice(f, "banner").click();
        await choice(f, "card").click();
        await f.page.locator('p9r-input[cms-param-sync="search"] input').fill("banner");
        await f.page.getByText("1 of 2 blocs", { exact: true }).waitFor();
        expect(f.writes.filter((w) => w.path === "/api/bloc/collections/availability")).toHaveLength(1);
        release();
        await f.page.waitForResponse(
            (r) =>
                r.url().includes("/api/bloc/collections/availability") &&
                r.request().postDataJSON().resource === "gallery/blocs/card" &&
                r.request().postDataJSON().active === "true",
        );
        await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await selection(f)).toEqual(["gallery/blocs/banner", "gallery/blocs/card", "gallery/blocs/retained"]);
        expect(f.writes.filter((w) => w.path === "/api/bloc/collections/availability")).toHaveLength(3);
        expect(f.errors).toEqual([]);
    } finally {
        release();
        await f.browser.close();
    }
}, 30000);

test("managed collection can deselect all, import another collection and apply an update", async () => {
    const f = await fixture();
    try {
        const installed = (await f.integrationInstallations.get("gallery"))!;
        await f.integrationInstallations.replace({ ...installed, activeResources: ["gallery/blocs/card"] });
        await f.goto("?collection=managed:gallery");
        await choice(f, "card").click();
        await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await selection(f)).toEqual([]);
        await f.page.getByRole("button", { name: "Check for updates", exact: true }).click();
        await f.page
            .locator("#collection-updates-modal")
            .getByRole("button", { name: "Update collection", exact: true })
            .click();
        await f.page.locator("p9r-tag").filter({ hasText: "Version 1.3.0" }).waitFor();
        await f.goto("?view=add");
        await f.page.getByRole("button", { name: "Import collection", exact: true }).click();
        await f.page.waitForURL((url) => (url.searchParams.get("collection") ?? "").startsWith("managed:additional"));
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 60000);

test("successful switches retain navigation, header and cards without fetching the library again", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=managed:gallery");
        await choice(f, "card").waitFor();
        const nav = await f.page.locator('[aria-label="Bloc collections"]').elementHandle();
        const card = await f.page.locator('cms-bloc-choice[resource="gallery/blocs/card"]').elementHandle();
        const before = f.reads.filter((path) => path.startsWith("/api/bloc/library")).length;
        await choice(f, "card").click();
        await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await nav!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await card!.evaluate((node) => node.isConnected && node.getAttribute("selected") === "false")).toBe(
            true,
        );
        expect(f.reads.filter((path) => path.startsWith("/api/bloc/library"))).toHaveLength(before);
        await f.goto("?collection=managed:gallery&visibility=hidden");
        await f.page.getByText("2 of 2 blocs", { exact: true }).waitFor();
        const filteredNav = await f.page.locator('[aria-label="Bloc collections"]').elementHandle();
        await choice(f, "card").click();
        await f.page.getByText("1 of 2 blocs", { exact: true }).waitFor();
        expect(await filteredNav!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await choice(f, "card").count()).toBe(0);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);
