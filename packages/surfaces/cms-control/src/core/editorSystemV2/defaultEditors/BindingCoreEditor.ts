import { Editor } from "@bernouy/cms-content/editor";

export class BindingCoreEditor extends Editor {

    override mountEditor(): void {
        this.declareDataScope({
            name: "plans",
            label: "Plans data",
            source: "urn:demo:plans",
            fields: [
                { path: "name", type: "string" },
                { path: "price", type: "number" },
                { path: "cta.label", type: "string" },
            ],
        });
    }

}
