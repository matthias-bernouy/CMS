import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

export function registerGridTest(): void {
    test("layout blocs keep intrinsic layout and observable semantic plain tones", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-grid",
        );
        const stack = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-stack",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-grid artifact");
        }
        if (!stack || stack.type !== "bloc") {
            throw new Error("expected basic-stack artifact");
        }

        const bloc = artifact.bloc;
        const encodedStyles = bloc.source?.["style.css"];
        const styles = encodedStyles ? Buffer.from(encodedStyles, "base64").toString("utf8") : "";
        expect(styles).toContain("display: grid");
        expect(styles).toContain("repeat(auto-fill, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).toContain("repeat(auto-fit, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).toContain("max-width: var(--basic-grid-max)");
        expect(styles).not.toContain("display: flex");
        expect(styles).not.toContain(':host([max]:not([max="none"])) { --basic-grid-justify: center; }');
        expect(styles).toContain(':host([packing="fit"])');
        expect(styles).toContain(':host([min="lg"])');
        expect(styles).toContain(':host([max="xl"])');
        expect(styles).toContain(':host([appearance="plain"])');
        expect(styles).toContain("--basic-grid-color: var(--_tone-contrasted)");
        const stackStyles = stack.bloc.source?.["style.css"]
            ? Buffer.from(stack.bloc.source["style.css"], "base64").toString("utf8")
            : "";
        expect(stackStyles).toContain(':host([appearance="plain"])');
        expect(stackStyles).toContain("--basic-stack-color: var(--_tone-contrasted)");
        expect(bloc.editorJS).toContain('attribute: "packing"');
        expect(bloc.editorJS).not.toContain('attribute: "columns"');
    });
}
