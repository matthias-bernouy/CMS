import { Editor } from '@bernouy/cms/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
        this.calc();
    }

    override onChildrenRemoved(): void {
        super.onChildrenRemoved();
        this.calc()
    }

    override onChildrenAdded(): void {
        super.onChildrenAdded();
        this.calc()
    }

    calc(){
        if (!this._hasDropdown) {
            this.target.removeAttribute("data-has-dropdown");
        } else {
            this.target.setAttribute("data-has-dropdown", "true");
        }
    }

    get _hasDropdown() {
        return this.target.querySelector("[slot='items']") !== null;
    }

    init() {}
    restore() {}

}
