import { expect } from "bun:test";
import type { Locator, Page } from "playwright";

const FIRST_IMAGE = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZAAAAABJRU5ErkJggg==",
    "base64",
);
const REPLACEMENT_IMAGE = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAABeK7cBAAAADUlEQVR42mP8z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "base64",
);

export async function mutateFiles(page: Page): Promise<void> {
    await filePageLink(page).click();
    await page.locator('#file-library [cms-bloc="ulvia-official-cluster"]').first().waitFor();
    const uploadDialog = page.locator("#upload-file-dialog");
    if (await uploadDialog.evaluate((dialog: HTMLDialogElement) => dialog.open)) {
        throw new Error("The upload dialog must be closed on initial render");
    }
    await upload(page, "smoke.png", FIRST_IMAGE);

    const card = fileCard(page, "smoke.png");
    const renameForm = capabilityForm(card, "workspace.files.update");
    await renameForm.locator('input[name="name"]').fill("smoke-renamed.png");
    await submit(page, "workspace.files.update", renameForm.locator('button[type="submit"]'));
    const renamed = fileCard(page, "smoke-renamed.png");
    await renamed.waitFor();

    await submit(page, "workspace.files.set-visibility", visibilityButton(renamed, "public"));
    const publicFile = fileCard(page, "smoke-renamed.png");
    await visibilityButton(publicFile, "private").waitFor();
    await replace(page, publicFile, "replacement.png", REPLACEMENT_IMAGE);
    const replaced = fileCard(page, "replacement.png");
    await submit(page, "workspace.files.set-visibility", visibilityButton(replaced, "private"));
    await visibilityButton(fileCard(page, "replacement.png"), "public").waitFor();
    await expectOpenImage(page, fileCard(page, "replacement.png"), 2);

    await upload(page, "delete-me.png", FIRST_IMAGE);
    const disposable = fileCard(page, "delete-me.png");
    await disposable.locator("details > summary").click();
    await submit(
        page,
        "workspace.files.delete",
        capabilityForm(disposable, "workspace.files.delete").locator("button"),
    );
    await disposable.waitFor({ state: "detached" });
}

export async function verifyFilesAfterRestart(page: Page): Promise<void> {
    await filePageLink(page).click();
    const persisted = fileCard(page, "replacement.png");
    await persisted.waitFor();
    await expectOpenImage(page, persisted, 2);
    await persisted.locator("details > summary").click();
    await submit(page, "workspace.files.delete", capabilityForm(persisted, "workspace.files.delete").locator("button"));
    await persisted.waitFor({ state: "detached" });
}

async function upload(page: Page, name: string, contents: Buffer): Promise<void> {
    const uploadDialog = page.locator("#upload-file-dialog");
    if (!(await uploadDialog.evaluate((dialog: HTMLDialogElement) => dialog.open))) {
        await page.locator('button[command="show-modal"][commandfor="upload-file-dialog"]').click();
    }
    await uploadDialog.evaluate((dialog: HTMLDialogElement) => {
        if (!dialog.open) {
            throw new Error("The upload dialog did not open");
        }
    });
    const flow = Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("workspace.upload.create")),
        page.waitForResponse(isRawUploadResponse),
        page.waitForResponse((candidate) => candidate.url().includes("workspace.upload.complete")).catch(() => null),
        page.waitForResponse(isWorkspaceResponse),
    ]);
    await page.locator('[cms-bloc="ulvia-official-file-upload"]:not([file-id]) input[name="file"]').setInputFiles({
        name,
        mimeType: "image/png",
        buffer: contents,
    });
    const [created, written, completed, refreshed] = await flow;
    await expectOk("workspace.upload.create", created);
    await expectOk("upload.write", written);
    await expectResponse("workspace.upload.complete", completed);
    await expectOk("workspace.get", refreshed);
    await uploadDialog.waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    await fileCard(page, name).waitFor();
}

async function replace(page: Page, card: Locator, name: string, contents: Buffer): Promise<void> {
    const flow = Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("workspace.upload.create")),
        page.waitForResponse(isRawUploadResponse),
        page.waitForResponse((candidate) => candidate.url().includes("workspace.upload.complete")).catch(() => null),
        page.waitForResponse(isWorkspaceResponse),
    ]);
    await card.locator('[cms-bloc="ulvia-official-file-upload"][file-id] input[type="file"]').setInputFiles({
        name,
        mimeType: "image/png",
        buffer: contents,
    });
    const [created, written, completed, refreshed] = await flow;
    await expectOk("workspace.upload.create", created);
    await expectOk("upload.write", written);
    await expectResponse("workspace.upload.complete", completed);
    await expectOk("workspace.get", refreshed);
    await fileCard(page, name).waitFor();
}

async function submit(page: Page, capabilityId: string, trigger: Locator): Promise<void> {
    const responsePromise = page.waitForResponse((candidate) => candidate.url().includes(capabilityId));
    const refreshed = page.waitForResponse(isWorkspaceResponse);
    await trigger.click();
    await expectOk(capabilityId, await responsePromise);
    await expectOk("workspace.get", await refreshed);
}

async function expectOpenImage(page: Page, card: ReturnType<typeof fileCard>, expectedWidth: number): Promise<void> {
    const responsePromise = page.waitForResponse((candidate) =>
        candidate.url().includes("/.cms/call/ulvia.cms.files/files/"),
    );
    await card.locator('[cms-bloc="ulvia-official-file-link"][file-id] > button').click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect(response.url()).toMatch(/\/\.cms\/call\/ulvia\.cms\.files\/files\//u);
    expect(new URL(response.url()).searchParams.has("access")).toBe(true);
    const image = page.locator("img");
    await image.waitFor();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(expectedWidth);
    await page.goBack();
    await page.locator('#file-library [cms-bloc="ulvia-official-cluster"]').first().waitFor();
}

function fileCard(page: Page, name: string) {
    return page.locator('#file-library [role="listitem"]').filter({ has: page.locator("h3", { hasText: name }) });
}

function filePageLink(page: Page) {
    return page.locator('a[href="/admin/files"]').first();
}

function capabilityForm(card: Locator, capabilityId: string): Locator {
    return card.locator(`form[cms-mutation*="${capabilityId}"]`);
}

function visibilityButton(card: Locator, visibility: "private" | "public"): Locator {
    return card.locator(
        `form[cms-mutation*="workspace.files.set-visibility"]:has(input[name="visibility"][value="${visibility}"]) button[type="submit"]`,
    );
}

async function expectOk(label: string, response: Awaited<ReturnType<Page["waitForResponse"]>>): Promise<void> {
    if (!response.ok()) {
        const body = await Promise.race([response.text(), Bun.sleep(1_000).then(() => "<response body timed out>")]);
        throw new Error(`${label} failed (${response.status()}): ${body}`);
    }
}

async function expectResponse(
    label: string,
    response: Awaited<ReturnType<Page["waitForResponse"]>> | null,
): Promise<void> {
    if (!response) {
        throw new Error(`${label} did not produce a response`);
    }
    await expectOk(label, response);
}

function isRawUploadResponse(response: Awaited<ReturnType<Page["waitForResponse"]>>): boolean {
    return response.request().method() === "PUT" && response.url().includes("/ulvia.cms.files/uploads/");
}

function isWorkspaceResponse(response: Awaited<ReturnType<Page["waitForResponse"]>>): boolean {
    return (
        ["GET", "QUERY"].includes(response.request().method()) &&
        response.url().includes("ulvia.cms.files/workspace.get")
    );
}
