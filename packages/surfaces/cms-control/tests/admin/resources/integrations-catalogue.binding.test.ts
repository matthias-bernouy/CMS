import { afterEach, describe, expect, test } from "bun:test";
import "../../../src/components/admin/Resources/Integrations/IntegrationBrowser";

afterEach(() => {
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("integration catalogue binding", () => {
    test("renders the catalogue as slotted p9r-grid items driven by the global binding runtime", () => {
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        const admin = document.createElement("cms-integrations-admin");
        document.body.append(admin);

        expect(admin.shadowRoot).toBeNull();

        const source = admin.querySelector<HTMLElement>("[data-catalogue-source]")!;
        expect(source.getAttribute("cms-source")).toBe(
            "/cms/api/integrations/catalogue?q=#{integrationSearch}&category=#{integrationCategory} as catalogue",
        );
        expect(source.getAttribute("cms-reload-on")).toBe("integration:updated");

        const template = source.querySelector("template")!;
        const grid = template.content.querySelector("p9r-grid[data-catalogue]")!;
        expect(grid.getAttribute("min")).toBe("lg");
        expect(grid.getAttribute("max")).toBe("lg");
        expect(grid.getAttribute("gap")).toBe("sm");

        const card = template.content.querySelector("p9r-grid > a.catalogue-card")!;
        expect(card.getAttribute("cms-repeat")).toBe("catalogue.items as integration");
        expect(card.getAttribute("href")).toBe("{{ integration.setupUrl }}");
        expect(card.getAttribute("data-definition-kind")).toBe("{{ integration.kind }}");
        expect(template.content.querySelector("[cms-repeat='integration.badges as badge']")).not.toBeNull();
        expect(template.content.querySelector("[cms-param-sync='integrationSearch']")).not.toBeNull();
        expect(template.content.querySelector("[cms-param-sync='integrationCategory']")).not.toBeNull();
    });
});
