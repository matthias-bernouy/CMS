import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapContentError } from "cms-content/application/capabilities/mapError";
import { deliveryResolveResource } from "cms-content/application/capabilities/delivery/resolve-resource";
import { examplesGet } from "cms-content/application/capabilities/examples/get";
import { examplesList } from "cms-content/application/capabilities/examples/list";
import { localizationTextSave } from "cms-content/application/capabilities/localization/text.save";
import { localizationUpdate } from "cms-content/application/capabilities/localization/update";
import { localizationTextsGet } from "cms-content/application/capabilities/localization/texts.get";
import { localizationGet } from "cms-content/application/capabilities/localization/get";
import { pagesCreate } from "cms-content/application/capabilities/pages/commands/create";
import { pagesDelete } from "cms-content/application/capabilities/pages/commands/delete";
import { pagesPublish } from "cms-content/application/capabilities/pages/commands/publish";
import { pagesRename } from "cms-content/application/capabilities/pages/commands/rename";
import { pagesUpdateRoute } from "cms-content/application/capabilities/pages/commands/update-route";
import { pagesUpdateSeo } from "cms-content/application/capabilities/pages/commands/update-seo";
import { pagesUpdate } from "cms-content/application/capabilities/pages/commands/update";
import { pagesEditorCatalogue } from "cms-content/application/capabilities/pages/queries/editor-catalogue";
import { pagesGet } from "cms-content/application/capabilities/pages/queries/get";
import { pagesList } from "cms-content/application/capabilities/pages/queries/list";
import { siteUpdate } from "cms-content/application/capabilities/site/update";
import { siteGet } from "cms-content/application/capabilities/site/get";
import { siteBlocsArchive } from "cms-content/application/capabilities/site/blocs/archive";
import { siteBlocsCreate } from "cms-content/application/capabilities/site/blocs/create";
import { siteBlocsPublish } from "cms-content/application/capabilities/site/blocs/publish";
import { siteBlocsRestore } from "cms-content/application/capabilities/site/blocs/restore";
import { siteBlocsGet } from "cms-content/application/capabilities/site/blocs/get";
import { siteBlocsList } from "cms-content/application/capabilities/site/blocs/list";
import { themeActivate } from "cms-content/application/capabilities/theme/activate";
import { themeTokenReset } from "cms-content/application/capabilities/theme/token.reset";
import { themeTokenSave } from "cms-content/application/capabilities/theme/token.save";
import { themeGet } from "cms-content/application/capabilities/theme/get";
export const contentFeature = defineFeature({
    "contractId": "ulvia/cms.content",
    "name": "CMS Content",
    "description": "Manage site settings, pages, localization and themes for one provider-selected CMS instance.",
    "version": "1.0.0",
    "publisherId": "ulvia",
    "catalogue": { "icon": "pages", "categories": ["administration", "content"] },
    documents: new URL("../../docs/", import.meta.url),
    mapError: mapContentError,
    capabilities: [
        deliveryResolveResource,
        examplesGet,
        examplesList,
        localizationTextSave,
        localizationUpdate,
        localizationTextsGet,
        localizationGet,
        pagesCreate,
        pagesDelete,
        pagesPublish,
        pagesRename,
        pagesUpdateRoute,
        pagesUpdateSeo,
        pagesUpdate,
        pagesEditorCatalogue,
        pagesGet,
        pagesList,
        siteUpdate,
        siteGet,
        siteBlocsArchive,
        siteBlocsCreate,
        siteBlocsPublish,
        siteBlocsRestore,
        siteBlocsGet,
        siteBlocsList,
        themeActivate,
        themeTokenReset,
        themeTokenSave,
        themeGet,
    ],
});
export type { ContentServices } from "cms-content/application/interfaces/ContentServices";
export type {
    ContentContributions,
    ContentContributionView,
    ContentTextSelection,
} from "cms-content/application/interfaces/ContentContributions";
export { ContentCapabilityError } from "cms-content/application/core/capabilities/errors";
