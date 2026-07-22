import { afterEach, describe, expect, test } from "bun:test";
import type { TopBar } from "../../src/components/Layout/TopBar/TopBar";
import type { EditorV2PageConfig } from "../../src/components/Layout/Shell/Shell";
import {
    applyPageSettingsTitle,
    closePageSettingsModal,
    openPageSettingsModal,
    parseTags,
    readPageSettingsForm,
    syncPageSettingsForm,
} from "../../src/components/Layout/Shell/Domain/shellPageSettings";

afterEach(() => {
    document.body.replaceChildren();
});

function pageConfig(): EditorV2PageConfig {
    return {
        id: "page-1",
        title: "About",
        path: "/about",
        published: true,
        description: "About the company",
        tags: ["company", "team"],
    };
}

function pageFields() {
    const published = document.createElement("select");
    for (const value of ["true", "false"]) {
        const option = document.createElement("option");
        option.value = value;
        published.append(option);
    }
    const fields = {
        title: document.createElement("input"),
        path: document.createElement("input"),
        published,
        description: document.createElement("textarea"),
        tags: document.createElement("input"),
    };
    const pageField = <T extends HTMLElement>(name: string): T => fields[name as keyof typeof fields] as unknown as T;
    return { fields, pageField };
}

describe("page settings domain", () => {
    test("opens and closes the settings modal while focusing its first input", () => {
        const modal = document.createElement("section");
        const input = document.createElement("input");
        modal.hidden = true;
        modal.append(input);
        document.body.append(modal);

        openPageSettingsModal(modal);

        expect(modal.hidden).toBe(false);
        expect(document.activeElement).toBe(input);

        closePageSettingsModal(modal);
        expect(modal.hidden).toBe(true);
    });

    test("synchronizes fields and reads normalized page settings", () => {
        const config = pageConfig();
        const { fields, pageField } = pageFields();

        syncPageSettingsForm(config, pageField);

        expect(fields.title.value).toBe("About");
        expect(fields.path.value).toBe("/about");
        expect(fields.published.value).toBe("true");
        expect(fields.description.value).toBe("About the company");
        expect(fields.tags.value).toBe("company, team");

        fields.title.value = "  Contact  ";
        fields.path.value = "  /contact  ";
        fields.published.value = "false";
        fields.description.value = "Contact us";
        fields.tags.value = " support, sales, support,  ";

        expect(readPageSettingsForm(config, pageField)).toEqual({
            id: "page-1",
            title: "Contact",
            path: "/contact",
            published: false,
            description: "Contact us",
            tags: ["support", "sales"],
        });
    });

    test("leaves forms and titles untouched when no page is loaded", () => {
        const { fields, pageField } = pageFields();
        fields.title.value = "Existing";
        const titles: Array<[string, string]> = [];
        const topBar = {
            setPageTitle: (title: string, path: string) => titles.push([title, path]),
        } as unknown as TopBar;

        syncPageSettingsForm(null, pageField);
        applyPageSettingsTitle(topBar, null);

        expect(fields.title.value).toBe("Existing");
        expect(readPageSettingsForm(null, pageField)).toBeNull();
        expect(titles).toEqual([]);
    });

    test("applies the current page title and deduplicates parsed tags", () => {
        const titles: Array<[string, string]> = [];
        const topBar = {
            setPageTitle: (title: string, path: string) => titles.push([title, path]),
        } as unknown as TopBar;

        applyPageSettingsTitle(topBar, pageConfig());

        expect(titles).toEqual([["About", "/about"]]);
        expect(parseTags(" news, featured, news, , featured ")).toEqual(["news", "featured"]);
    });
});
