import { describe, expect, test } from "bun:test";
import { File } from "node:buffer";
import { isNativeBlocTag, prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { decodeDefaultContent, loadDefinition } from "./source";

const EXPECTED_TAGS = [
    "doc-anchor-heading",
    "doc-api-endpoint",
    "doc-api-params",
    "doc-api-property",
    "doc-breadcrumb",
    "doc-callout",
    "doc-code-block",
    "doc-code-diff",
    "doc-code-inline",
    "doc-code-kbd",
    "doc-code-tabs",
    "doc-code-terminal",
    "doc-edit-link",
    "doc-embed",
    "doc-feedback",
    "doc-figure",
    "doc-glossary-term",
    "doc-layout",
    "doc-math",
    "doc-mermaid",
    "doc-prev-next",
    "doc-search",
    "doc-sidebar-link",
    "doc-sidebar-section",
    "doc-step",
    "doc-steps",
    "doc-toc",
    "doc-updated",
    "doc-version",
];

describe("documentation-blocs 1.0.0 catalogue", () => {
    test("hydrates the complete official documentation catalog", async () => {
        const definition = await loadDefinition();
        const blocs = definition.artifacts.filter((artifact) => artifact.type === "bloc");

        expect(definition.kind).toBe("documentation-blocs");
        expect(definition.version).toBe("1.0.0");
        expect(definition.inputs).toEqual([]);
        expect(blocs.map((artifact) => artifact.bloc.tag).sort()).toEqual(EXPECTED_TAGS);

        for (const artifact of blocs) {
            expect(artifact.bloc.source?.["manifest.json"]).toBeTruthy();
            expect(artifact.bloc.source?.["default.html"]).toBeTruthy();
            expect(artifact.bloc.source?.["Bloc.ts"]).toBeTruthy();
            expect(artifact.bloc.source?.["BlocEditor.ts"]).toBeTruthy();
        }
    });

    test("validates and builds every runtime and editor source", async () => {
        const definition = await loadDefinition();

        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc") {
                continue;
            }
            const bloc = artifact.bloc;
            expect(
                validateBloc({
                    tag: bloc.tag,
                    native: isNativeBlocTag(bloc.tag),
                    viewSource: bloc.viewJS,
                    ...(bloc.editorJS ? { editorSource: bloc.editorJS } : {}),
                }).errors,
            ).toEqual([]);

            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
                bloc.name,
                bloc.group ?? "",
                bloc.description ?? "",
                bloc.tag,
                bloc.source,
                decodeDefaultContent(bloc.source),
                { native: isNativeBlocTag(bloc.tag) },
            );

            expect(built.id).toBe(bloc.tag);
            expect(built.viewJS).toContain(bloc.tag);
            expect(built.editorJS).toContain("registerEditor");
        }
    });

    test("force-refreshes every owned bloc when the installation is re-run", async () => {
        const definition = await loadDefinition();
        const installations = new InMemoryIntegrationInstallationRepository();
        const calls: Array<{ tag: string; force: boolean }> = [];
        const deps = {
            sources: new InMemorySourceRepository(),
            secrets: new InMemorySecretStore(),
            installations,
            blocs: {
                async importBloc(artifact: { tag: string }, options: { force?: boolean }) {
                    const force = options.force === true;
                    calls.push({ tag: artifact.tag, force });
                    return { id: artifact.tag, action: force ? ("updated" as const) : ("created" as const) };
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [definition],
            dto: { kind: definition.kind, answers: {}, options: {} },
        });
        const rerun = await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations,
            siteIntegrations: [definition],
            integrationId: definition.kind,
            body: {},
        });

        expect(calls.slice(0, EXPECTED_TAGS.length).every((call) => !call.force)).toBe(true);
        expect(calls.slice(EXPECTED_TAGS.length).every((call) => call.force)).toBe(true);
        expect(rerun.artifacts).toHaveLength(EXPECTED_TAGS.length);
        expect(rerun.artifacts.every((artifact) => artifact.action === "updated")).toBe(true);
        expect(rerun.installation.runCount).toBe(2);
    });
});
