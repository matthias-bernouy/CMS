import { expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const path = "packages/surfaces/cms-control/src/components/admin/WidgetList.ts";
const inspect = (content: string) => inspectMarkup({ path, content, kind: "script", browser: true });

test("accepts component-owned light-DOM bindings without a private core or stylesheet", () => {
    expect(
        inspect(`class WidgetList extends HTMLElement {
            connectedCallback() {
                this.innerHTML = \`<section cms-source="/api/widgets as widgets">
                    <template cms-repeat="widgets as widget">
                        <p9r-card cms-condition="widget.visible">
                            <span>{{ widget.title }}</span>
                        </p9r-card>
                    </template>
                </section>\`;
            }
        }`),
    ).toEqual([]);
});

test("does not ban visual Shadow DOM with encapsulated CSS and a slot for light-DOM children", () => {
    expect(
        inspect(`class VisualFrame extends HTMLElement {
            constructor() {
                super();
                const root = this.attachShadow({ mode: "open" });
                root.innerHTML = '<style>:host { display: block; }</style><slot></slot>';
            }
        }`),
    ).toEqual([]);
});

test("rejects a private core in light DOM while recommending valid component composition", () => {
    const [finding] = inspect('this.innerHTML = "<cms-binding-core><widget-list></widget-list></cms-binding-core>";');
    expect(finding).toMatchObject({ rule: "binding-core-owner", severity: "ERROR" });
    expect(finding?.recommendation).toContain("including component-owned children");
    expect(finding?.recommendation).toContain("do not add a private core or component stylesheet to light DOM");
});
