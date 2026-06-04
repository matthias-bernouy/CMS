import {
    Accordion,
    AccordionItem,
    Alert,
    Avatar,
    Badge,
    Breadcrumb,
    BreadcrumbItem,
    Button,
    Card,
    Checkbox,
    Container,
    Divider,
    FetchComponent as BlocsFetchComponent,
    Form as BlocsForm,
    FormDialog,
    FormSection,
    HorizontalActionGroup,
    IconButton,
    InputFile,
    LateralDialog,
    LateralMenu,
    LateralMenuItem,
    LeftMenuLayout,
    Modal,
    OpenModal,
    P9rInput,
    P9rRange,
    P9rSelect,
    P9rSizesSelect,
    Pagination,
    Progress,
    Radio,
    RadioGroup,
    SegmentedSwitch,
    Skeleton,
    Spinner,
    Stack,
    Step,
    Stepper,
    Switch,
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
    Tooltip,
    Stat,
    LineChart,
    BarList,
    RangeTabs,
} from "@bernouy/cms-blocs";

function define(tag: string, constructor: CustomElementConstructor) {
    if (!customElements.get(tag)) customElements.define(tag, constructor);
}

define("p9r-accordion", Accordion);
define("p9r-accordion-item", AccordionItem);
define("p9r-alert", Alert);
define("p9r-avatar", Avatar);
define("p9r-badge", Badge);
define("p9r-breadcrumb", Breadcrumb);
define("p9r-breadcrumb-item", BreadcrumbItem);
define("p9r-button", Button);
define("p9r-card", Card);
define("w13c-checkbox", Checkbox);
define("p9r-container", Container);
define("p9r-divider", Divider);
define("w13c-fetch", BlocsFetchComponent);
define("w13c-form", BlocsForm);
define("p9r-form-dialog", FormDialog);
define("p9r-section", FormSection);
define("p9r-horizontal-action-group", HorizontalActionGroup);
define("p9r-icon-button", IconButton);
define("w13c-input-file", InputFile);
define("w13c-lateral-dialog", LateralDialog);
define("w13c-lateral-menu", LateralMenu);
define("w13c-lateral-menu-item", LateralMenuItem);
define("w13c-left-menu-layout", LeftMenuLayout);
define("p9r-modal", Modal);
define("p9r-open-modal", OpenModal);
define("p9r-input", P9rInput);
define("p9r-range", P9rRange);
define("p9r-select", P9rSelect);
define("p9r-sizes-select", P9rSizesSelect);
define("p9r-pagination", Pagination);
define("p9r-progress", Progress);
define("p9r-radio", Radio);
define("p9r-radio-group", RadioGroup);
define("p9r-segmented-switch", SegmentedSwitch);
define("p9r-skeleton", Skeleton);
define("p9r-spinner", Spinner);
define("p9r-stack", Stack);
define("p9r-step", Step);
define("p9r-stepper", Stepper);
define("p9r-switch", Switch);
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
define("p9r-tooltip", Tooltip);
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
import "./admin/ListFilter/ListFilter"
import "@bernouy/auth-core/components"
import "./admin/OpenDialog/OpenDialog"
import "./admin/ProviderActions/ProviderActions"
import "./admin/RoleSelect/RoleSelect"
import "./admin/Tokens/TokenCreate"
import "./admin/Secrets/Secrets"

// Editor
import "./editor/componentSync/PageLink/PageLink"
import "./editor/componentSync/PageLink/PageLink.picker"
import "./editor/componentSync/SyncPanel"
import "./editor/componentSync/sync/AttrSync"
import "./editor/componentSync/sync/CompSync"
import "./editor/componentSync/sync/ImageSync/ImageSync"
import "./editor/componentSync/sync/StateSync/StateSync"
import "./editor/componentSync/sync/SvgSync/SvgSync"
import "./editor/EditorSystem/BlocActions/BlocActions"
import "./editor/EditorSystem/BlocLibrary/BlocLibrary"
import "./editor/EditorSystem/DragManager"
import "./editor/EditorSystem/EditorRoot/EditorRoot"
import "./editor/EditorSystem/EditorRoot/TemplatePicker/TemplatePicker"
import "./editor/EditorSystem/FloatingToolbar/FloatingToolbar"
import "./editor/EditorSystem/ObserverManager"
import "./editor/MediaCenter/MediaCenter"
import "./editor/RichTextBar/RichTextBar"

import "./editor/configurations/Configuration/EditorConfiguration"

// Snippets
import "./editor/snippet/Snippet/Snippet"

// Medias
import "./media/CardMedia/CardMedia"
import "./media/CropSystem/CropSystem"
import "./media/DetailMedia/DetailMedia"
import "./media/GridMedia/GridMedia"
import "./media/MediaAdmin/MediaAdmin"

// Form
import "./form/Form/Form";
import "./form/MediaInput/MediaInput";
import "./form/Validate/Validate";
import "./data/fetch/FetchComponent"
import "./data/JsonEditor/JsonEditor"
