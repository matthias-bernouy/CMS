import { Editor } from '@bernouy/cms-control/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
        this.computeContainerQuery();
    }

    init() {
        this.observer.observe(this.target, {
            characterData: true,
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: [ "navbar-breakpoint" ]
        });
    }

    restore() {
        this.observer.disconnect();
    }

    private observer = new MutationObserver((e) => {
        if (e.length === 1 && e[0]?.attributeName === "navbar-breakpoint") return;
        this.computeContainerQuery();
    })

    sandbox(){
        const sandbox = document.createElement('div');
        sandbox.setAttribute('aria-hidden', 'true');
        sandbox.style.cssText = [
            'visibility:hidden',
            'position: absolute',
            'top: -99999px'
        ].join(';');

        const clone = this.target.cloneNode(true) as HTMLElement;
        clone.setAttribute("navbar-breakpoint", "0px") // force inline

        sandbox.append(clone);
        document.body.append(sandbox)
        return sandbox;
    }

    computeContainerQuery() {

        const sandbox = this.sandbox() as HTMLElement;
        const host = sandbox.firstChild! as HTMLElement
        let minWidth = 0;
        let style;
        
        const nav = host.shadowRoot?.querySelector(".navbar")! as HTMLElement
        const links = host.shadowRoot?.querySelector(".links")! as HTMLElement

        host.style.minWidth = "1920px";
        nav.style.flexWrap = "nowrap"
        nav.style.maxWidth = "unset"

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {

                const linksWidth = links.offsetWidth;
                links.style.flex = "0 0 auto";

                minWidth += nav.offsetWidth

                style = getComputedStyle(host);
                minWidth += parseFloat(style.marginLeft);
                minWidth += parseFloat(style.marginRight);
                minWidth += parseFloat(style.paddingLeft);
                minWidth += parseFloat(style.paddingRight);

                minWidth += links.offsetWidth - linksWidth;

                this.target.setAttribute("navbar-breakpoint", minWidth + "px");
                (this.target as any).updateCSS();

                sandbox.remove();
            })
        })


    }

}
