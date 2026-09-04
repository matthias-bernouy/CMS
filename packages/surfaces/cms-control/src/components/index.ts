import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import {
    Accordion,
    AccordionItem,
    ActionMenu,
    ActionMenuItem,
    ActionMenuSection,
    Alert,
    Avatar,
    Badge,
    Button,
    Card,
    Checkbox,
    Combobox,
    Container,
    Grid,
    IconButton,
    LateralDialog,
    LateralMenu,
    LateralMenuItem,
    LeftMenuLayout,
    Modal,
    OpenModal,
    P9rInput,
    P9rSelect,
    PhotoAlbum,
    SegmentedSwitch,
    Stack,
    TabPanel,
    Table,
    TableCell,
    TableHeaderCell,
    TableRow,
    Tabs,
    Tag,
    TagSuggest,
    Textarea,
    TokenInput,
    Toast,
    ToastStack,
    Stat,
    Switch,
    LineChart,
    BarList,
    RangeTabs,
    BindingCore,
    setBindingFilters,
} from "@bernouy/components";
import { PageFormController } from "./admin/Common/PageSettings/PageFormController";
import { PageCopySource } from "./admin/Common/PageSettings/PageCopySource";

function define(tag: string, constructor: CustomElementConstructor) {
    if (!customElements.get(tag)) {
        customElements.define(tag, constructor);
    }
}

define(CMS_BINDING_CORE_TAG, BindingCore);
define("cms-page-form-controller", PageFormController);
define("cms-page-copy-source", PageCopySource);
setBindingFilters({
    json: (value) => (value === undefined ? undefined : JSON.stringify(value)),
    jsonurl: (value) => (value === undefined ? undefined : encodeURIComponent(JSON.stringify(value))),
    lines: (value) => (Array.isArray(value) ? value.join("\n") : value),
});
define("p9r-accordion", Accordion);
define("p9r-accordion-item", AccordionItem);
define("p9r-action-menu", ActionMenu);
define("p9r-action-menu-item", ActionMenuItem);
define("p9r-action-menu-section", ActionMenuSection);
define("p9r-alert", Alert);
define("p9r-avatar", Avatar);
define("p9r-badge", Badge);
define("p9r-button", Button);
define("p9r-card", Card);
define("w13c-checkbox", Checkbox);
define("p9r-combobox", Combobox);
define("p9r-container", Container);
define("p9r-grid", Grid);
define("p9r-icon-button", IconButton);
define("w13c-lateral-dialog", LateralDialog);
define("w13c-lateral-menu", LateralMenu);
define("w13c-lateral-menu-item", LateralMenuItem);
define("w13c-left-menu-layout", LeftMenuLayout);
define("p9r-modal", Modal);
define("p9r-open-modal", OpenModal);
define("p9r-input", P9rInput);
define("p9r-select", P9rSelect);
define("p9r-photo-album", PhotoAlbum);
define("p9r-segmented-switch", SegmentedSwitch);
define("p9r-stack", Stack);
define("p9r-tab-panel", TabPanel);
define("p9r-table", Table);
define("p9r-cell", TableCell);
define("p9r-header-cell", TableHeaderCell);
define("p9r-row", TableRow);
define("p9r-tabs", Tabs);
define("p9r-tag", Tag);
define("p9r-tag-suggest", TagSuggest);
define("p9r-textarea", Textarea);
define("p9r-token-input", TokenInput);
define("p9r-toast", Toast);
define("p9r-toast-stack", ToastStack);
define("p9r-stat", Stat);
define("w13c-switch", Switch);
define("p9r-line-chart", LineChart);
define("p9r-bar-list", BarList);
define("p9r-range-tabs", RangeTabs);

import "./globals";

// Admin
import "./admin/Layout/AdminLayout/AdminLayout";
import "./admin/Layout/FormSaveAction/FormSaveAction";
import "./admin/Common/ConfirmForm/ConfirmForm";
import "./admin/Common/CredentialSelect/CredentialSelect";
import "./admin/Common/EmptyState/EmptyState";
import "./admin/Common/EventToast/EventToast";
import "./admin/Resources/Auth/LoginMethods/LoginMethods";
import "./admin/Actions/ProviderActions/ProviderActions";
import "./admin/Common/RoleSelect/RoleSelect";
import "./admin/Common/PageSettings/PageIndexingSettings";
import "./admin/RoleEditor/RoleEditor";
import "./admin/Actions/UserActions/UserActions";
import "./admin/Common/Tokens/TokenCreate";
import "./admin/Secrets/Secrets";
import "./admin/Layout/SettingsSections/SettingsSections";
import "./admin/Layout/SettingsSections/AuthenticationTabs";
import "./admin/Layout/AnalyticsPrivacySettings/AnalyticsPrivacySettings";
import "./admin/Layout/ShellDetail/ShellDetail";
import "./admin/Layout/Analytics/AnalyticsNav";
import "./admin/Layout/Analytics/AnalyticsDashboard";
import "./admin/Layout/EndpointPerformance/EndpointPerformance";
import "./admin/Theme/ThemeEditor";
import "./admin/Theme/ThemeNav";
import "./admin/Resources/Dashboards/navigation/DashboardNav";
import "./admin/Resources/Dashboards/view/DashboardView";
import "./admin/DashboardWorkspace/DashboardNav";
import "./admin/DashboardWorkspace/DashboardWorkspace";
import {
    CmsDashboardAdminNav,
    CmsDashboardAdminStyles,
    CmsDashboardIcon,
} from "./admin/DashboardWorkspace/configuration/AdminSupport";
import { CmsDashboardCreateController } from "./admin/DashboardWorkspace/configuration/CreateController";
import { CmsDashboardMemberFilter } from "./admin/DashboardWorkspace/configuration/MemberFilter";
import { CmsDashboardNavigationEditor } from "./admin/DashboardWorkspace/configuration/NavigationEditor";
define("cms-dashboard-admin-styles", CmsDashboardAdminStyles);
define("cms-dashboard-admin-nav", CmsDashboardAdminNav);
define("cms-dashboard-icon", CmsDashboardIcon);
define("cms-dashboard-create-controller", CmsDashboardCreateController);
define("cms-dashboard-member-filter", CmsDashboardMemberFilter);
define("cms-dashboard-navigation-editor", CmsDashboardNavigationEditor);
import "./admin/Resources/Functions/detail/FunctionDetail";
import "./admin/Resources/Functions/create/FunctionCreate";
import "./admin/Resources/Integrations/IntegrationBrowser";
import "./admin/Resources/Triggers/TriggersAdmin";
import "./admin/Resources/Triggers/TriggerCreate";

// Editor
import "./editorSystemV2/siteBloc/SiteBlocBuilder";
import "./editorSystemV2/bootstrap";

// Medias
import "./media/CardMedia/CardMedia";
import "./media/CropSystem/CropSystem";
import "./media/DetailMedia/DetailMedia";
import "./media/GridMedia/GridMedia";
import "./media/MediaAdmin/MediaAdmin";
import "./media/MediaCenter/MediaCenter";

// Form
import "./form/MediaInput/MediaInput";
