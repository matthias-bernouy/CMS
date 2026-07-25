import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

export const filterTag = "test-commerce-schema-offer-filter";
export const listTag = "test-commerce-schema-offer-list";

export async function defineFilter(): Promise<void> {
    await defineCommerceBloc(filterTag, "commerce-offer-filter");
}

export async function defineList(): Promise<void> {
    await defineCommerceBloc(listTag, "commerce-offer-list");
}

async function defineCommerceBloc(tag: string, artifactTag: string): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === artifactTag,
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error(`${artifactTag} source not found`);
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Commerce",
        artifact.bloc.description ?? "",
        tag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}

export async function settleLifecycle(): Promise<void> {
    for (let pass = 0; pass < 4; pass++) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

export async function settleUntil(predicate: () => boolean, passes = 20): Promise<void> {
    for (let pass = 0; pass < passes; pass++) {
        if (predicate()) {
            return;
        }
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out while settling the Commerce filter lifecycle");
}

export function captureSourceWrites(element: Element): string[] {
    const sources: string[] = [];
    const setAttribute = element.setAttribute.bind(element);
    element.setAttribute = ((name: string, value: string) => {
        if (name === "cms-source") {
            sources.push(value);
        }
        setAttribute(name, value);
    }) as typeof element.setAttribute;
    return sources;
}
