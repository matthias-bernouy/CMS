import "@bernouy/webcomponents";

import type { LateralDialog } from "@bernouy/webcomponents";
import { Component } from "@bernouy/cms/component";

import "./sync/AttrSync";
import "./sync/CompSync";
import "./sync/ImageSync/ImageSync";
import "./sync/StateSync";
import "./PageLink/PageLink";

export class SyncPanel extends Component {

    private dialog : LateralDialog | null = null;

    constructor() {
        super({
            css: "",
            template: `
            <w13c-lateral-dialog>
                <slot></slot>
                <span slot="title">Element Configuration</span>
            </w13c-lateral-dialog>
            `
        });
    }

    override connectedCallback() {
        this.dialog = this.shadowRoot?.querySelector("w13c-lateral-dialog") as LateralDialog;
    }

    show() {
        this.dialog?.show();
    }

    close(){
        this.dialog?.close();
    }

    init(opts?: { added?: HTMLElement; removed?: HTMLElement }){
        const elements = Array.from(this.querySelectorAll("*")) as any[];
        for ( const element of elements ) {
            if ( element.init ) element.init(opts);
        }
    }

}

if ( !customElements.get("p9r-config-panel") ){
    customElements.define("p9r-config-panel", SyncPanel)
}