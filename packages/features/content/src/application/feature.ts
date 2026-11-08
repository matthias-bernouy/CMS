import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapContentError } from "content/application/capabilities/mapError";
import { deliveryResolveResource } from "content/application/capabilities/delivery/resolve-resource";
import { examplesGet } from "content/application/capabilities/examples/get";
import { examplesList } from "content/application/capabilities/examples/list";
import { localizationTextSave } from "content/application/capabilities/localization/text.save";
import { localizationUpdate } from "content/application/capabilities/localization/update";
import { localizationTextsGet } from "content/application/capabilities/localization/texts.get";
import { localizationGet } from "content/application/capabilities/localization/get";
import { pagesCreate } from "content/application/capabilities/pages/commands/create";
import { pagesDelete } from "content/application/capabilities/pages/commands/delete";
import { pagesPublish } from "content/application/capabilities/pages/commands/publish";
import { pagesRename } from "content/application/capabilities/pages/commands/rename";
import { pagesUpdateRoute } from "content/application/capabilities/pages/commands/update-route";
import { pagesUpdateSeo } from "content/application/capabilities/pages/commands/update-seo";
import { pagesUpdate } from "content/application/capabilities/pages/commands/update";
import { pagesEditorCatalogue } from "content/application/capabilities/pages/queries/editor-catalogue";
import { pagesGet } from "content/application/capabilities/pages/queries/get";
import { pagesList } from "content/application/capabilities/pages/queries/list";
import { siteUpdate } from "content/application/capabilities/site/update";
import { siteGet } from "content/application/capabilities/site/get";
import { siteBlocsArchive } from "content/application/capabilities/site/blocs/archive";
import { siteBlocsCreate } from "content/application/capabilities/site/blocs/create";
import { siteBlocsPublish } from "content/application/capabilities/site/blocs/publish";
import { siteBlocsRestore } from "content/application/capabilities/site/blocs/restore";
import { siteBlocsGet } from "content/application/capabilities/site/blocs/get";
import { siteBlocsList } from "content/application/capabilities/site/blocs/list";
import { themeActivate } from "content/application/capabilities/theme/activate";
import { themeTokenReset } from "content/application/capabilities/theme/token.reset";
import { themeTokenSave } from "content/application/capabilities/theme/token.save";
import { themeGet } from "content/application/capabilities/theme/get";
export const contentFeature = defineFeature({
    "contractId": "ulvia/cms.content",
    "name": "CMS Content",
    "description": "Manage site settings, pages, localization and themes for one provider-selected CMS instance.",
    "version": "1.0.1",
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
export type { ContentServices } from "content/application/interfaces/ContentServices";
export type {
    ContentContributions,
    ContentContributionView,
    ContentTextSelection,
} from "content/application/interfaces/ContentContributions";
export { ContentCapabilityError } from "content/application/core/capabilities/errors";
