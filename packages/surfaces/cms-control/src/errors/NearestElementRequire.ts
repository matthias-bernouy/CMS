

export class NearestElementRequire extends Error {
    
    constructor(ele: HTMLElement, target: keyof HTMLElementTagNameMap){
        super("The element " + ele.tagName + " should be placed under <" + target + ">")
    }

}