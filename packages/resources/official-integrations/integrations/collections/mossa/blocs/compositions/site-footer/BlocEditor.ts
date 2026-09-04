import { Editor, registerEditor } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
