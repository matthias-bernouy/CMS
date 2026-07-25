import { describe, expect, test } from "bun:test";
import { collectCmsSourceBindings } from "@bernouy/cms-content";
import { artifactPath, compileBloc, readBlocFile, tags } from "./harness";

describe("sales-configurator bloc contracts", () => {
    test("declares six compilable light-DOM bloc artifacts", async () => {
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

    test("keeps the catalog browser read-only on the flat partner projection", async () => {
        const content = await readBlocFile("sales-catalog-browser", "default.html");
        const view = await readBlocFile("sales-catalog-browser", "Bloc.ts");

        expect(collectCmsSourceBindings(content)).toEqual([
            {
                url: "/.cms/sources/sales-configurator/getPartnerCatalog",
                alias: "catalogData",
                method: "GET",
                trigger: "auto",
            },
        ]);
        expect(content).toContain('cms-repeat="catalogData.selectionRows as row"');
        expect(content).toContain('cms-repeat="row.requirements as requirement"');
        expect(content).toContain("data-sales-catalog-query");
        expect(content).toContain("data-sales-catalog-status");
        expect(content).toContain("data-sales-catalog-filter-empty");
        expect(content).toContain('class="sales-catalog-table-scroll"');
        expect(content).toContain('<table class="sales-catalog-table"');
        expect(content).toContain('<th scope="col">Service</th>');
        expect(content).toContain('<th scope="col">Provider</th>');
        expect(content).toContain('<th scope="col">Prix</th>');
        expect(content).toContain('<th scope="col">Prérequis</th>');
        expect(content).not.toContain('<th scope="col">Type</th>');
        expect(content).not.toContain('<th scope="col">Disponibilité</th>');
        expect(content).toContain("min-width: 48rem");
        expect(content).toContain("sales-service-cell");
        expect(content).toContain('data-sales-row-kind="{{ row.kind }}"');
        expect(content).not.toContain('data-sales-depth="{{ row.depth }}"');
        expect(content).toContain('data-sales-module-id="{{ row.moduleId }}"');
        expect(content).toContain('data-sales-variant-id="{{ row.variantId }}"');
        expect(content).toContain('class="sales-kind-badge"');
        expect(content).toContain('class="sales-availability-badge"');
        expect(content).toContain("data-sales-module-counts");
        expect(content).toContain("data-sales-collapsed-label");
        expect(content).toContain("data-sales-expanded-label");
        expect(content).toContain("<button\n                                data-sales-module-toggle");
        expect(content).toContain('class="sales-catalog-cell sales-price-cell" data-label="Prix"');
        expect(content).toContain('class="sales-catalog-cell" data-label="Prérequis"');
        expect(content).not.toContain("<form");
        expect(content).not.toContain("cms-source-method");
        expect(content).not.toContain("cms-source-trigger");
        expect(view).toContain("/getPartnerCatalog as catalogData");
        expect(view).not.toContain('row.toggleAttribute("data-sales-expanded", expanded)');
        expect(view).toContain("usefulRows");
        expect(view).not.toContain("cms-param-sync");
        expect(view).not.toMatch(/\bfetch\s*\(/);
        expect(view).not.toContain("location.");
    });

    test("keeps the client directory on binding-owned reads and writes", async () => {
        const content = await readBlocFile("sales-client-directory", "default.html");
        const view = await readBlocFile("sales-client-directory", "Bloc.ts");

        expect(collectCmsSourceBindings(content)).toContainEqual({
            url: "/.cms/sources/sales-configurator/listMyClients?limit=100",
            alias: "clientsData",
            method: "GET",
            trigger: "auto",
        });
        expect(content).toContain("/saveMyClient as clientResult");
        expect(content).toContain("data-sales-client-edit-form");
        expect(content).toContain("data-sales-client-detail-template");
        expect(content).toContain("data-sales-client-detail-mount");
        expect(content).toContain("<dialog data-sales-client-create-dialog");
        expect(content).toContain("<dialog data-sales-client-detail-source data-sales-client-edit-dialog");
        expect(content).toContain("data-sales-client-create-open");
        expect(content).toContain('<header class="sales-section-header"');
        expect(content).toContain('appearance="ghost">Annuler</basic-button>');
        expect(content).not.toContain('appearance="text"');
        expect(content).toContain(">Nouveau client</basic-button>");
        expect(content).toContain(">Modifier</basic-button>");
        expect(content).toContain("data-sales-client-dialog-close");
        expect(content.match(/>Annuler<\/basic-button>/g)).toHaveLength(3);
        expect(content).not.toContain("data-sales-client-detail-placeholder");
        expect(content).toContain('class="sales-client-list sales-client-table-scroll"');
        expect(content).toContain('<table class="sales-client-table"');
        expect(content).toContain('<th scope="col">Entreprise / SIRET</th>');
        expect(content).toContain('<th scope="col">Contact / fonction</th>');
        expect(content).toContain('<th scope="col">Coordonnées</th>');
        expect(content).toContain('<th scope="col">Ville / Pays</th>');
        expect(content).toContain('<tr class="sales-client-row" cms-repeat="clientsData.items as client">');
        expect(content).toContain('data-sales-client-open data-client-id="{{ client.id }}"');
        expect(content).not.toContain('cms-repeat="clientsData.items as client">\n            <span slot="eyebrow"');
        expect(content).toContain('name="id" value="{{ clientData.id }}"');
        expect(content).toContain('cms-reload-on="sales-clients:changed"');
        expect(content.match(/cms-source-publish="sales-clients:changed"/g)).toHaveLength(1);
        expect(view).toContain("/getMyClient?id=${encodeURIComponent(selectedId)} as clientData");
        expect(view).toContain('typeof dialog.showModal === "function"');
        expect(view).toContain('this.addEventListener("cancel", this.onCancel, true)');
        expect(view).toContain('this.addEventListener("cms-source:success", this.onSourceSuccess)');
        expect(view).not.toMatch(/\bfetch\s*\(/);
        expect(view).not.toContain("location.");
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
        expect(content).not.toContain("data-sales-danger-action");
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
            "partnerAccountId",
            "partnerCapabilities",
            "catalogData",
            "missingRequirements",
        ]) {
            expect(content).not.toContain(privateField);
        }
    });
});
