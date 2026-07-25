import { describe, expect, test } from "bun:test";
import { collectCmsSourceBindings } from "@bernouy/cms-content";
import { artifactPath, compileBloc, readBlocFile, tags } from "./harness";

describe("sales-configurator bloc contracts", () => {
    test("declares four compilable light-DOM bloc artifacts", async () => {
        for (const tag of tags) {
            const manifest = JSON.parse(await readBlocFile(tag, "manifest.json")) as Record<string, unknown>;
            const artifact = JSON.parse(await Bun.file(artifactPath(tag)).text()) as {
                type: string;
                bloc: { tag: string; path: string };
            };
            const view = await readBlocFile(tag, "Bloc.ts");
            const editor = await readBlocFile(tag, "BlocEditor.ts");
            const content = await readBlocFile(tag, "default.html");
            const compiled = await compileBloc(tag);

            expect(manifest).toMatchObject({
                "default-tag": tag,
                bloc: "./Bloc.ts",
                editor: "./BlocEditor.ts",
                defaultContent: "./default.html",
            });
            expect(artifact).toMatchObject({
                type: "bloc",
                bloc: { tag, path: `blocs/${tag}` },
            });
            expect(view).toContain("extends HTMLElement");
            expect(view).not.toMatch(/\bfetch\s*\(/);
            expect(view).not.toContain("location.");
            expect(content).not.toContain("<cms-binding-core");
            expect(editor).toContain("contentSlots()");
            expect(editor).toContain('{ kind: "any-component" }');
            expect(editor).not.toContain("endpoint-picker");
            expect(compiled.viewJS).toContain(`customElements.define("test-${tag}"`);
            expect(compiled.editorJS).toBeTruthy();
            expect(content).toContain(`<${tag}`);
        }
    });

    test("authors every transport state explicitly", async () => {
        for (const tag of tags) {
            const content = await readBlocFile(tag, "default.html");
            expect(content).toContain("$source.loading");
            expect(content).toContain("$source.error");
            expect(content).toContain("$source.empty");
            expect(content).toContain("$source.loaded");
        }
        const list = await readBlocFile("sales-proposal-list", "default.html");
        expect(list).toContain("$source.empty || $source.loaded && proposals.items.length == 0");
        expect(list).toContain('cms-repeat="proposals.items as proposal"');
        expect(list).toContain('cms-page-state="salesProposalCursor"');
        expect(list).toContain("data-sales-proposal-start");
        expect(list).toContain('data-sales-proposal-link data-proposal-id="{{ proposal.id }}"');
        expect(list).toContain("data-sales-empty-unfiltered");
        expect(list).toContain("data-sales-empty-filtered");
        expect(list).not.toContain('href="/proposals/edit?proposalId={{ proposal.id }}"');
    });

    test("materializes the proposal list source for delivery access preflight", async () => {
        const content = await readBlocFile("sales-proposal-list", "default.html");

        expect(collectCmsSourceBindings(content)).toContainEqual({
            url: "/.cms/sources/sales-configurator/listMyProposals?q=#{salesProposalQuery}&status=#{salesProposalStatus}&cursor=@{salesProposalCursor}&limit=20",
            alias: "proposals",
            method: "GET",
            trigger: "auto",
        });
        expect(content).toContain('cms-reload-on="sales-proposals:changed"');
    });

    test("locks builder writes to binding-owned forms and publishes refresh events", async () => {
        const content = await readBlocFile("sales-proposal-builder", "default.html");
        const view = await readBlocFile("sales-proposal-builder", "Bloc.ts");

        expect(content).toContain("/saveMyProposalDraft as saveResult");
        expect(content).toContain("/publishMyProposal as publishResult");
        expect(content).toContain("/createMyProposalShare as shareResult");
        expect(content).toContain("/revokeMyProposalShare as revokeResult");
        expect(content.match(/cms-source-trigger="submit"/g)).toHaveLength(4);
        expect(content.match(/cms-source-method="POST"/g)).toHaveLength(4);
        expect(content.match(/cms-source-publish="sales-proposals:changed"/g)).toHaveLength(3);
        expect(content).toContain("proposalData.proposal.draftVersion.items");
        expect(content).toContain("proposalData.proposal.publishedVersion.items");
        expect(content).toContain("shareResult.body.token");
        expect(content).not.toContain("shareResult.token");
        expect(content).not.toContain("proposalData.proposal.version");
        expect(content).toContain('name="expectedVersionId"');
        expect(content).toContain('name="expectedRevision"');
        expect(content).toContain("data-sales-terminal");
        expect(content).not.toContain('name="selectedVariantIds"');
        expect(content).not.toContain('name="selectedFeatureIds"');
        expect(view).toContain('import { prepareDraftPayload } from "./formPayload"');
        expect(view).toContain('const REFRESH_EVENT = "sales-proposals:changed"');
        expect(view).not.toContain("fixedTotalCents +");
        expect(view).not.toContain("unitAmountCents +");
    });

    test("keeps the shared view on the client-safe projection", async () => {
        const content = await readBlocFile("sales-proposal-view", "default.html");
        const view = await readBlocFile("sales-proposal-view", "Bloc.ts");

        expect(view).toContain("/getSharedProposal?token=#{");
        expect(content).toContain("shared.proposal.items");
        for (const privateField of [
            "privateNotes",
            "ownerCmsUserId",
            "partnerCapabilities",
            "catalogData",
            "missingRequirements",
        ]) {
            expect(content).not.toContain(privateField);
        }
    });
});
