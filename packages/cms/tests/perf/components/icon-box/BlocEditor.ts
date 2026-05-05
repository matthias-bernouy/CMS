import { Editor } from '@bernouy/cms/editor';
import Config from './configuration.html' with { type: 'text' };
export class BlocEditor extends Editor {
    constructor(target: HTMLElement) { super(target, "", Config as unknown as string); }
    init() {} restore() {}
}
