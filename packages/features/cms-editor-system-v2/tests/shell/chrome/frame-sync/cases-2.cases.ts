import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    describe,
    expect,
    frameDetail,
    installDom,
    parseHTML,
    shellParts,
    test,
} from "./support";

describe("Shell frame binding sync", () => {
    test("restores view source templates before restarting runtime", async () => {
        installDom();

        const { restartViewBindingRuntime } = await import(
            "../../../../src/components/Layout/Shell/Domain/Bindings/shellBindingPreview"
        );
        const { document: viewDocument } = parseHTML(`
            <div data-cms-editor-root>
                <${CMS_BINDING_CORE_TAG}>
                    <main data-cms-content>
                        <section cms-source="/api/plans"><base-skeleton shape="rect"></base-skeleton></section>
                    </main>
                </${CMS_BINDING_CORE_TAG}>
            </div>
        `);
        const source = viewDocument.querySelector("[cms-source]")!;
        const core = viewDocument.querySelector(CMS_BINDING_CORE_TAG) as HTMLElement & {
            runtime?: { stop(): void; deactivate(): void } | null;
            startRuntime?: () => void;
        };
        const calls: string[] = [];
        let captured = "";
        core.runtime = {
            deactivate: () => {
                calls.push("deactivate");
                source.innerHTML = `<p cms-repeat="data as data">{{ data.label }}</p><base-skeleton shape="rect" cms-condition="$source.loading"></base-skeleton>`;
            },
            stop: () => calls.push("stop"),
        };
        core.startRuntime = () => {
            calls.push("start");
            captured = source.innerHTML;
        };

        restartViewBindingRuntime(viewDocument);

        expect(calls).toEqual(["deactivate", "start"]);
        expect(captured).toContain(`cms-repeat="data as data"`);
        expect(captured).toContain(`cms-condition="$source.loading"`);
    });
});
