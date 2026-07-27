import type { SiteBlocDefinition, SiteBlocSlot, SiteBlocSnapshot } from "@bernouy/cms-content";
import {
    canonicalJson,
    canonicalSiteBlocDefinition,
    normalizeSiteBlocSnapshot,
} from "cms-bloc-compile/core/site-bloc/canonicalSiteBloc";
import { serializeSiteBlocDefault, serializeSiteBlocTemplate } from "cms-bloc-compile/core/site-bloc/siteBlocHtml";

const VIEW_SOURCE = `import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };

const css = ":host { display: block; }";

export class SiteCompositeBloc extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SiteCompositeBloc);
`;

export function generateSiteBlocSourceBundle(
    definition: SiteBlocDefinition,
    snapshot?: SiteBlocSnapshot,
): Record<"manifest.json" | "Bloc.ts" | "BlocEditor.ts" | "template.html" | "default.html" | "builder.json", string> {
    const selected = normalizeSiteBlocSnapshot(snapshot ?? publishedSnapshot(definition));
    return {
        "manifest.json": manifestSource(definition.tag, selected),
        "Bloc.ts": VIEW_SOURCE,
        "BlocEditor.ts": editorSource(selected.slots),
        "template.html": serializeSiteBlocTemplate(selected),
        "default.html": serializeSiteBlocDefault(definition.tag, selected.defaultContent),
        "builder.json": canonicalSiteBlocDefinition(definition),
    };
}

function publishedSnapshot(definition: SiteBlocDefinition): SiteBlocSnapshot {
    if (!definition.published || definition.publishedRevision === null) {
        throw new Error(`Site bloc "${definition.tag}" has no published snapshot`);
    }
    return definition.published;
}

function manifestSource(tag: string, snapshot: SiteBlocSnapshot): string {
    return `${JSON.stringify(
        {
            "default-tag": tag,
            bloc: "./Bloc.ts",
            editor: "./BlocEditor.ts",
            defaultContent: "./default.html",
            meta: { title: snapshot.name, description: snapshot.description },
        },
        null,
        4,
    )}\n`;
}

function editorSource(slots: SiteBlocSlot[]): string {
    const runtimeSlots = slots.map(({ id: _id, ...slot }) => slot);
    const slotLiteral = canonicalJson(runtimeSlots).trimEnd();
    return `import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

const slots: ContentSlot[] = ${slotLiteral};

export class SiteCompositeBlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return slots;
    }
}

registerEditor({ editor: SiteCompositeBlocEditor });
`;
}
