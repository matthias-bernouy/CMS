import baseCss from "./base/style.css" with { type: "text" };
import { Card } from "./base/Bloc.ts";

import template from "./template.html" with { type: "text" };
import offerCss from "./style.css" with { type: "text" };

export class OfferCard extends Card {
    constructor() {
        super({
            css: `${String(baseCss)}\n${String(offerCss)}`,
            template: template as unknown as string,
        });
    }
}
