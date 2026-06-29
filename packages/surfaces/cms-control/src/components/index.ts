import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import {
    Accordion,
    AccordionItem,
    Alert,
    Avatar,
    Badge,
    Button,
    Card,
    Checkbox,
    Container,
    Form as BlocsForm,
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
    Toast,
    ToastStack,
    Stat,
    LineChart,
    BarList,
    RangeTabs,
    BindingCore,
} from "@bernouy/components";

function define(tag: string, constructor: CustomElementConstructor) {
    if (!customElements.get(tag)) customElements.define(tag, constructor);
}

define(CMS_BINDING_CORE_TAG, BindingCore);
define("p9r-accordion", Accordion);
define("p9r-accordion-item", AccordionItem);
define("p9r-alert", Alert);
define("p9r-avatar", Avatar);
define("p9r-badge", Badge);
define("p9r-button", Button);
define("p9r-card", Card);
define("w13c-checkbox", Checkbox);
define("p9r-container", Container);
define("w13c-form", BlocsForm);
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
define("p9r-toast", Toast);
define("p9r-toast-stack", ToastStack);
define("p9r-stat", Stat);
define("p9r-line-chart", LineChart);
define("p9r-bar-list", BarList);
define("p9r-range-tabs", RangeTabs);

import "./globals"

// Admin
import "./admin/AdminLayout/AdminLayout"
import "./admin/ConfirmForm/ConfirmForm"
import "./admin/CredentialSelect/CredentialSelect"
import "./admin/EmptyState/EmptyState"
import "./admin/EndpointsInput/EndpointsInput"
import "./admin/EventToast/EventToast"
import "@bernouy/cms-auth/components"
import "./admin/ProviderActions/ProviderActions"
import "./admin/RoleSelect/RoleSelect"
import "./admin/RoleEditor/RoleEditor"
import "./admin/Tokens/TokenCreate"
import "./admin/Secrets/Secrets"
import "./admin/Resources/Sources/SourceExplorer"
import "./admin/Resources/Integrations/IntegrationBrowser"

// Editor
import "./editorSystemV2/bootstrap"

// Medias
import "./media/CardMedia/CardMedia"
import "./media/CropSystem/CropSystem"
import "./media/DetailMedia/DetailMedia"
import "./media/GridMedia/GridMedia"
import "./media/MediaAdmin/MediaAdmin"
import "./media/MediaCenter/MediaCenter"

// Form
import "./form/Form/Form";
import "./form/MediaInput/MediaInput";
