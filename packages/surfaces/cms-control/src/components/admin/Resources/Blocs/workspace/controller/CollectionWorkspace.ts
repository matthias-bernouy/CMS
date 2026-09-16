import css from "../style.css" with { type: "text" };
import themeCss from "../theme.css" with { type: "text" };
import textsCss from "../views/texts.css" with { type: "text" };
import blocsView from "../views/blocs.html" with { type: "text" };
import chrome from "../views/chrome.html" with { type: "text" };
import landingView from "../views/landing.html" with { type: "text" };
import overviewView from "../views/overview.html" with { type: "text" };
import textsView from "../views/texts.html" with { type: "text" };
import themeView from "../views/theme.html" with { type: "text" };
import "../ThemeSpecimen/ThemeSpecimen";
import "../TokenPreview/ThemeTokenPreview";
import "../BlocDefaults/BlocDefaults";
import { ThemeEditingController } from "../ThemeEditing/Controller";
import { ThemeProfileController } from "../ThemeEditing/Context/ProfileController";
import { SiteVariablesController } from "../ThemeEditing/Context/SiteVariablesController";
import "../ThemeEditing/ThemeTokenEditor";
import "../../preview/BlocPreview";
import "../../BlocChoice";
import "../../artwork/LibraryArtwork";
import "../../icons/LibraryIcon";
import { AvailabilityController } from "cms-control/components/admin/Resources/Blocs/availability/Controller";
import {
    cancelIntegrationUpgrade,
    confirmIntegrationUpgrade,
    openIntegrationUpgrade,
} from "cms-control/components/admin/Resources/Integrations/ui/actions/installation";
import {
    collectionWorkspacePath,
    collectionWorkspaceRouteFromPath,
    isCollectionWorkspaceSection,
} from "cms-control/core/content/collectionWorkspace/routes";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { configureWorkspaceForms } from "./forms";
import { filterWorkspaceNavigation } from "./navigation";

const template = `<w13c-fixed-admin-layout data-collection-source>${chrome}${landingView}${overviewView}${themeView}${blocsView}${textsView}</w13c-fixed-admin-layout>`;

export class CmsCollectionWorkspace extends HTMLElement {
    private readonly availability = new AvailabilityController(this);
    private readonly themeProfiles = new ThemeProfileController(this);
    private readonly themeEditing = new ThemeEditingController(this, this.themeProfiles);
    private readonly siteVariables = new SiteVariablesController(this);

    connectedCallback(): void {
        if (!this.hasAttribute("data-rendered")) {
            this.innerHTML = `<style>${String(css)}${String(themeCss)}${String(textsCss)}</style>${template}`;
            this.setAttribute("data-rendered", "");
        }
        this.configureRoute();
        this.addEventListener("click", this.clickAction);
        this.addEventListener("input", this.inputAction);
        this.availability.connect();
        this.themeEditing.connect();
        this.themeProfiles.connect();
        this.siteVariables.connect();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.clickAction);
        this.removeEventListener("input", this.inputAction);
        this.availability.disconnect();
        this.themeEditing.disconnect();
        this.themeProfiles.disconnect();
        this.siteVariables.disconnect();
    }

    private configureRoute(): void {
        const basePath = getMetaBasePath();
        const route = collectionWorkspaceRouteFromPath(window.location.pathname, basePath);
        const source = this.querySelector<HTMLElement>("[data-collection-source]");
        const home = this.querySelector<HTMLElement>("[data-collections-home]");
        home?.setAttribute("href", `${basePath}/admin/collections`);
        configureWorkspaceForms(this, basePath);
        if (!route || !source) {
            this.querySelector<HTMLElement>("[data-invalid-route]")?.removeAttribute("hidden");
            return;
        }
        const query = [
            ...(route.collection ? [`collection=${encodeURIComponent(route.collection)}`] : []),
            ...(route.section ? [`section=${route.section}`] : []),
            "bloc=#{bloc}",
            "token=#{token}",
            "theme=#{theme}",
        ].join("&");
        source.setAttribute("cms-source", `${basePath}/api/collections/workspace?${query} as workspace`);
        source.setAttribute("cms-reload-on", "collection:changed bloc:changed integration:updated theme:changed");
        this.configureTabs(basePath, route.collection, route.section);
        home?.toggleAttribute("active", !route.collection);
    }

    private configureTabs(basePath: string, collection: string | undefined, active: string | undefined): void {
        this.querySelector<HTMLElement>("[data-collection-tabs]")?.toggleAttribute("hidden", !collection);
        for (const link of Array.from(this.querySelectorAll<HTMLElement>("[data-collection-section]"))) {
            const section = link.dataset.collectionSection;
            if (collection && section && isCollectionWorkspaceSection(section)) {
                link.setAttribute("href", collectionWorkspacePath(basePath, collection, section));
                link.toggleAttribute("active", active === section);
            }
        }
    }

    private readonly clickAction = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const open = target?.closest<HTMLElement>("[data-upgrade-open]");
        const cancel = target?.closest<HTMLElement>("[data-upgrade-cancel]");
        const confirm = target?.closest<HTMLElement>("[data-upgrade-confirm]");
        if (open) {
            void openIntegrationUpgrade(open);
        } else if (cancel) {
            cancelIntegrationUpgrade(cancel);
        } else if (confirm) {
            void confirmIntegrationUpgrade(confirm);
        }
    };

    private readonly inputAction = (event: Event): void => {
        const target =
            event.target instanceof Element ? event.target.closest<HTMLElement>("[data-collection-nav-search]") : null;
        const menu = target?.closest<HTMLElement>("w13c-lateral-menu");
        if (target && menu) {
            const value = "value" in target && typeof target.value === "string" ? target.value : "";
            filterWorkspaceNavigation(menu, value);
        }
    };
}

if (!customElements.get("cms-collection-workspace")) {
    customElements.define("cms-collection-workspace", CmsCollectionWorkspace);
}
