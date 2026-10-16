import { BlocBehavior, CMS_BLOC_FORM_CONTROL_READY_EVENT } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.addEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
        this.connectControl(this.blocRoot);
        for (const root of this.queryBlocRoots()) {
            this.connectControl(root);
        }
    }

    override disconnectedCallback(): void {
        this.removeEventListener(CMS_BLOC_FORM_CONTROL_READY_EVENT, this.handleControlReady);
    }

    private handleControlReady = (event: Event): void => {
        const root = event.target;
        if (root instanceof HTMLElement && root.parentElement?.closest("[cms-bloc]") === this.blocRoot) {
            this.connectControl(root);
        }
    };

    private connectControl(root: HTMLElement): void {
        const label = this.querySelector<HTMLLabelElement>('label[part~="field-label"]');
        if (!label) {
            return;
        }
        const descriptions = this.querySelectorAll<HTMLElement>('[part~="field-description"], [part~="field-error"]');
        this.connectBlocFormControl(root, { label, descriptions });
    }
}
