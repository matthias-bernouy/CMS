(()=>{class a extends HTMLElement{constructor(e){super();let t=this.attachShadow({mode:"open"});if(e){let r=document.createElement("style");r.textContent=e.css,t.appendChild(r);let n=document.createElement("template");n.innerHTML=e.template,t.appendChild(n.content.cloneNode(!0))}}connectedCallback(){}}var p=`:host { display: block; padding: 1.75rem 2rem; max-width: 1280px; }

[part="header"] {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.main { min-width: 0; }
.actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

slot[name="title"]::slotted(h1) {
    margin: 0;
    font-size: 1.65rem;
    color: var(--text-main);
    line-height: 1.2;
}
slot[name="title"]::slotted(p) {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
}
`;class g extends a{constructor(){super({css:p,template:`
                <header part="header">
                    <div class="main"><slot name="title"></slot></div>
                    <div class="actions"><slot name="actions"></slot></div>
                </header>
                <div part="body"><slot></slot></div>`})}}if(!customElements.get("hub-page"))customElements.define("hub-page",g);var A=`:host { display: block; margin-bottom: 2rem; }

[part="title"] {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    color: var(--text-main);
}
[part="title"][hidden] { display: none; }
`;class k extends a{static get observedAttributes(){return["label"]}constructor(){super({css:A,template:'<h2 part="title" hidden></h2><div part="body"><slot></slot></div>'})}connectedCallback(){this._sync()}attributeChangedCallback(){this._sync()}_sync(){let e=this.shadowRoot?.querySelector("[part='title']");if(!e)return;let t=this.getAttribute("label")??"";e.textContent=t,e.hidden=t===""}}if(!customElements.get("hub-section"))customElements.define("hub-section",k);var b=`:host { display: block; }

[part="grid"] {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
}

/* The <w13c-fetch> host stamps its cards as siblings — keep it out of the
 * grid flow so it doesn't claim a cell. */
[part="grid"] ::slotted(w13c-fetch) { display: contents; }

[part="empty"] { margin-top: 0.5rem; }
[part="empty"][hidden] { display: none; }
`;class h extends a{constructor(){super({css:b,template:`
                <div part="grid"><slot></slot></div>
                <div part="empty"><slot name="empty"></slot></div>`})}connectedCallback(){let e=this.shadowRoot.querySelector("slot:not([name])");e.addEventListener("slotchange",()=>this._sync(e)),this._sync(e)}_sync(e){let t=e.assignedElements().filter((r)=>r.tagName!=="W13C-FETCH"&&r.tagName!=="TEMPLATE").length;this.shadowRoot.querySelector("[part='empty']").hidden=t>0}}if(!customElements.get("hub-grid"))customElements.define("hub-grid",h);var E=`:host { display: block; }

[part="empty"] { margin-top: 1rem; }
[part="empty"][hidden] { display: none; }
`;class w extends a{_observer=null;constructor(){super({css:E,template:`
                <p9r-table>
                    <slot name="header" slot="header"></slot>
                    <slot></slot>
                </p9r-table>
                <div part="empty"><slot name="empty"></slot></div>`})}connectedCallback(){this._observer=new MutationObserver(()=>this._sync()),this._observer.observe(this,{childList:!0,subtree:!0}),this._sync()}disconnectedCallback(){this._observer?.disconnect()}_sync(){let e=this.querySelectorAll("p9r-row:not([slot])").length;this.shadowRoot.querySelector("[part='empty']").hidden=e>0}}if(!customElements.get("hub-table"))customElements.define("hub-table",w);var M=`:host { display: block; }

[part="tile"] {
    display: block;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 120ms, transform 120ms;
}
a[part="tile"][href]:hover {
    border-color: var(--primary-base);
    transform: translateY(-1px);
}

.label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}
.value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
    margin-top: 0.25rem;
    color: var(--text-main);
}
.sub {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
}
.sub[hidden] { display: none; }
`;class v extends a{static get observedAttributes(){return["label","sub","href"]}constructor(){super({css:M,template:`
                <a part="tile">
                    <span class="label"></span>
                    <span class="value"><slot></slot></span>
                    <span class="sub"></span>
                </a>`})}connectedCallback(){this._sync()}attributeChangedCallback(){this._sync()}_sync(){let e=this.shadowRoot;if(!e)return;let t=e.querySelector("a"),r=this.getAttribute("href");if(r)t.setAttribute("href",r);else t.removeAttribute("href");e.querySelector(".label").textContent=this.getAttribute("label")??"";let n=e.querySelector(".sub");n.textContent=this.getAttribute("sub")??"",n.hidden=!this.getAttribute("sub")}}if(!customElements.get("hub-stat"))customElements.define("hub-stat",v);var z=`:host { display: inline; }

code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    background: var(--bg-base);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border-default);
    color: var(--text-body);
}

:host([block]) { display: block; }
:host([block]) code {
    display: block;
    padding: 0.75rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
}
`;class L extends a{constructor(){super({css:z,template:'<code part="code"><slot></slot></code>'})}}if(!customElements.get("hub-code"))customElements.define("hub-code",L);var R=`:host {
    display: block;
    margin: 0 0 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.45;
}
`;class B extends a{constructor(){super({css:R,template:"<slot></slot>"})}}if(!customElements.get("hub-hint"))customElements.define("hub-hint",B);var re=new Set(["active","enabled","ok","up"]);class U extends a{connectedCallback(){let e=(this.getAttribute("value")??"").trim(),t=re.has(e.toLowerCase())?"success":"danger",r=document.createElement("p9r-badge");r.setAttribute("color",t),r.setAttribute("dot",""),r.textContent=e||"unknown",this.shadowRoot.replaceChildren(r)}}if(!customElements.get("hub-status"))customElements.define("hub-status",U);var $=`<pre part="code"></pre>
`;var W=`:host {
    display: block;
}

pre {
    margin: 0;
    overflow: auto;
    max-height: 28rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-body);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 2;
}
`;function u(e){return new URLSearchParams(window.location.search).get(e)||""}async function m(e){try{let t=await fetch(e,{headers:{Accept:"application/json"}});if(!t.ok)return null;return(await t.json())?.data??null}catch{return null}}async function s(e,t,r){try{let n=await fetch(t,{method:e,headers:{"Content-Type":"application/json",Accept:"application/json"},...r!==void 0?{body:JSON.stringify(r)}:{}});if(n.ok)return{ok:!0};let o=`HTTP ${n.status}`;try{let i=await n.json();if(i?.error?.message)o=i.error.message}catch{}return{ok:!1,message:o}}catch(n){return{ok:!1,message:n instanceof Error?n.message:String(n)}}}class S extends a{_value=void 0;static get observedAttributes(){return["value","src","path"]}constructor(){super({css:W,template:$})}connectedCallback(){this._init()}attributeChangedCallback(){if(this.isConnected)this._init()}get value(){return this._value}set value(e){this._value=e,this._render()}async _init(){let e=this.getAttribute("src");if(e){let t=this.shadowRoot?.querySelector("pre");if(t)t.textContent="Loading…";let r=this._withPageQuery(e),n=await m(r);this._value=this._resolvePath(n,this.getAttribute("path"))}this._render()}_withPageQuery(e){let t=new URLSearchParams(window.location.search);if([...t].length===0)return e;let[r,n=""]=e.split("?"),o=new URLSearchParams(n);for(let[i,l]of t)if(!o.has(i))o.set(i,l);return`${r}?${o.toString()}`}_resolvePath(e,t){if(!t)return e;return t.split(".").reduce((r,n)=>r==null?r:r[n],e)}_resolve(){if(this._value!==void 0)return this._value;let r=(this.getAttribute("value")??this.textContent??"").trim();if(!r)return null;try{return JSON.parse(r)}catch{return r}}_render(){let e=this.shadowRoot?.querySelector("pre");if(!e)return;let t=this._resolve();e.textContent=typeof t==="string"?t:JSON.stringify(t,null,2)}}if(!customElements.get("hub-json"))customElements.define("hub-json",S);var X=`:host {
    display: block;
}

[part="form"] {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
}

.group {
    margin: 0.75rem 0 0;
    font-size: 0.95rem;
    color: var(--text-main);
    border-bottom: 1px solid var(--border-light, var(--border-default));
    padding-bottom: 0.25rem;
}

textarea {
    width: 100%;
    min-height: 5rem;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-body);
    font: inherit;
    resize: vertical;
}

select[multiple] {
    width: 100%;
    padding: 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-body);
}
`;function Y(e){let t=e["x-widget"];if(typeof t==="string")return t;if(e.writeOnly)return"password";if(e.type==="boolean")return"toggle";if(e.type==="integer"||e.type==="number")return"number";if(e.type==="string"&&Array.isArray(e.enum))return"select";if(e.type==="string"&&e.format==="date")return"date";if(e.type==="string")return"text";if(e.type==="array"&&e.items&&Array.isArray(e.items.enum))return"select-multiple";if(e.type==="array")return"tags";return"text"}function K(e,t,r){let n=e["x-writable-by"],o=Array.isArray(t.defaultWritableBy)?t.defaultWritableBy:["control-plane","tenant"];return(Array.isArray(n)?n:o).includes(r)}function Q(e,t,r,n,o){let i,l=r===void 0||r===null?"":String(r);switch(n){case"toggle":if(i=document.createElement("p9r-switch"),i.setAttribute("name",e),r===!0||r==="true")i.setAttribute("checked","");break;case"select":i=document.createElement("p9r-select"),i.setAttribute("name",e);for(let d of t.enum){let c=document.createElement("option");if(c.value=String(d),c.textContent=String(d),String(d)===l)c.selected=!0;i.appendChild(c)}break;case"select-multiple":{i=document.createElement("select"),i.setAttribute("multiple",""),i.setAttribute("name",e);let d=Array.isArray(r)?r:[];for(let c of t.items.enum){let f=document.createElement("option");if(f.value=String(c),f.textContent=String(c),d.includes(c))f.selected=!0;i.appendChild(f)}break}case"number":case"slider":if(i=document.createElement("p9r-input"),i.setAttribute("type","number"),i.setAttribute("name",e),i.setAttribute("value",l),t.minimum!==void 0)i.setAttribute("min",String(t.minimum));if(t.maximum!==void 0)i.setAttribute("max",String(t.maximum));break;case"password":if(i=document.createElement("p9r-input"),i.setAttribute("type","password"),i.setAttribute("name",e),!t.writeOnly)i.setAttribute("value",l);break;case"date":i=document.createElement("p9r-input"),i.setAttribute("type","date"),i.setAttribute("name",e),i.setAttribute("value",l);break;case"textarea":i=document.createElement("textarea"),i.setAttribute("name",e),i.value=l;break;case"tags":i=document.createElement("p9r-input"),i.setAttribute("type","text"),i.setAttribute("name",e),i.setAttribute("placeholder","comma-separated values"),i.setAttribute("value",Array.isArray(r)?r.join(", "):l),i.dataset.tags="1";break;default:i=document.createElement("p9r-input"),i.setAttribute("type","text"),i.setAttribute("name",e),i.setAttribute("value",l)}if(!o)i.setAttribute("disabled","");if(t.title)i.setAttribute("label",t.title);if(t.description)i.setAttribute("hint",t.description);return i}function Z(e,t,r){if(r==="toggle")return Boolean(e.hasAttribute("checked")||e.checked);if(r==="select-multiple"){let o=[];for(let i of e.options)if(i.selected)o.push(i.value);return o}if(r==="tags"){let o=(e.value||e.getAttribute("value")||"").trim();return o?o.split(",").map((i)=>i.trim()).filter(Boolean):[]}if(r==="number"||r==="slider"){let o=e.value!==void 0?e.value:e.getAttribute("value");if(o===""||o===null||o===void 0)return;let i=Number(o);return t.type==="integer"?Math.trunc(i):i}if(r==="password"&&t.writeOnly){let o=e.value!==void 0?e.value:e.getAttribute("value");return o?o:void 0}let n=e.value!==void 0?e.value:e.getAttribute("value");return n===""||n===null||n===void 0?void 0:n}class D extends a{_schema=null;_value={};_fields=[];constructor(){super({css:X,template:"<div part='form'></div>"})}connectedCallback(){this._schema=this._parse("schema"),this._value=this._parse("value")??{},this.rebuild()}get mode(){return this.getAttribute("mode")||"tenant"}get _prefix(){return this.getAttribute("prefix")||""}_parse(e){let t=this.getAttribute(e);if(!t)return null;try{return JSON.parse(t)}catch{return null}}get _root(){return this.shadowRoot.querySelector("[part='form']")}rebuild(){let e=this._root;if(e.innerHTML="",this._fields=[],!this._schema||typeof this._schema!=="object")return;let t=this._schema.properties||{},r=new Set(this._schema.required||[]),n=new Map;for(let[o,i]of Object.entries(t)){if(i.writeOnly&&this.mode==="tenant")continue;let l=K(i,this._schema,this.mode),d=Y(i),c=this._prefix?`${this._prefix}.${o}`:o,f=this._value[o]!==void 0?this._value[o]:i.default,x=Q(c,i,f,d,l);if(x.dataset.fieldName=o,r.has(o))x.setAttribute("required","");x.addEventListener("change",()=>this._emitChange()),x.addEventListener("input",()=>this._emitChange()),this._fields.push({name:o,prop:i,el:x,widget:d});let y=i["x-group"]||"default";(n.get(y)??n.set(y,[]).get(y)).push(x)}for(let[o,i]of n){if(o!=="default"){let l=document.createElement("h4");l.className="group",l.textContent=o,e.appendChild(l)}for(let l of i)e.appendChild(l)}}_emitChange(){this.dispatchEvent(new CustomEvent("hub-config-change",{detail:{values:this.getValues(),valid:this.isValid()},bubbles:!0,composed:!0}))}getValues(){let e={};for(let{name:t,prop:r,el:n,widget:o}of this._fields){let i=Z(n,r,o);if(i!==void 0)e[t]=i}return e}isValid(){let e=this.getValues();for(let t of new Set(this._schema?.required||[])){let r=e[t];if(r===void 0||r===null||r==="")return!1;if(Array.isArray(r)&&r.length===0)return!1}return!0}}if(!customElements.get("hub-config-form"))customElements.define("hub-config-form",D);class P extends HTMLElement{connectedCallback(){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>this._apply(),{once:!0});else this._apply()}_apply(){let e=this.getAttribute("param");if(!e)return;let t=new URLSearchParams(window.location.search).get(e)??"",r=encodeURIComponent(t),n=`__${e.toUpperCase()}__`,o=this.getAttribute("target");if(o)document.querySelectorAll(o).forEach((i)=>{i.textContent=t});for(let i of Array.from(document.body.querySelectorAll("*")))for(let l of["href","target","url"]){let d=i.getAttribute(l);if(d&&d.includes(n))i.setAttribute(l,d.replaceAll(n,r))}}}if(!customElements.get("hub-route-param"))customElements.define("hub-route-param",P);var F=`:host { display: block; }

[part="root"] { display: flex; flex-direction: column; gap: 0.75rem; }

.list { display: flex; flex-direction: column; gap: 0.5rem; }

.row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: end;
}

.actions { display: flex; gap: 0.5rem; }

.msg:empty { display: none; }
`;class V extends a{_issuers=[];constructor(){super({css:F,template:"<div part='root'></div>"})}connectedCallback(){this._load()}get _tenantId(){return this.getAttribute("tenant-id")||u("tenantId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}async _load(){let e=await m(`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`);this._issuers=e?.issuers?[...e.issuers]:[],this._render()}_render(){let e=this._root;e.innerHTML="";let t=document.createElement("div");t.className="list",this._issuers.forEach((l,d)=>t.appendChild(this._row(l,d))),e.appendChild(t);let r=document.createElement("div");r.className="actions";let n=document.createElement("p9r-button");n.setAttribute("variant","ghost"),n.textContent="+ Add an issuer",n.addEventListener("click",()=>{this._issuers.push(""),this._render()});let o=document.createElement("p9r-button");o.setAttribute("color","primary"),o.textContent="Save trust-list",o.addEventListener("click",()=>void this._save()),r.append(n,o),e.appendChild(r);let i=document.createElement("div");i.className="msg",e.appendChild(i)}_row(e,t){let r=document.createElement("div");r.className="row";let n=document.createElement("p9r-input");n.setAttribute("label",`Issuer ${t+1}`),n.setAttribute("placeholder","https://keycloak.example/realms/acme"),n.setAttribute("value",e),n.addEventListener("input",()=>{this._issuers[t]=n.value??n.getAttribute("value")??""});let o=document.createElement("p9r-button");return o.setAttribute("variant","ghost"),o.setAttribute("color","danger"),o.textContent="✕",o.addEventListener("click",()=>{this._issuers.splice(t,1),this._render()}),r.append(n,o),r}async _save(){let e=this.shadowRoot.querySelector(".msg");e.innerHTML="";let t=this._issuers.map((o)=>o.trim()).filter(Boolean),r=await s("PATCH",`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,{issuers:t}),n=document.createElement("p9r-alert");if(r.ok)n.setAttribute("type","success"),n.textContent="Trust-list saved.",this._issuers=t,document.dispatchEvent(new CustomEvent("tenant:updated",{bubbles:!0}));else n.setAttribute("type","error"),n.textContent=`Failed: ${r.message}`;e.appendChild(n)}}if(!customElements.get("hub-tenant-issuers"))customElements.define("hub-tenant-issuers",V);var O=`:host { display: block; }

form { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }

.msg:empty { display: none; }
`;class T extends a{constructor(){super({css:O,template:"<div part='root'></div>"})}connectedCallback(){this._load()}get _tenantId(){return this.getAttribute("tenant-id")||u("tenantId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}_info(e,t){let r=document.createElement("p9r-alert");if(e)r.setAttribute("type",e);r.textContent=t,this._root.replaceChildren(r)}async _load(){this._root.textContent="Loading…";let e=this._tenantId,t=await m(`/api/namespaces/tenants?tenantId=${encodeURIComponent(e)}`);if(!t){this._info("error","Unknown tenant.");return}let n=(await m(`/api/providers?providerId=${encodeURIComponent(t.providerId)}`))?.schemas?.tenantConfig??null;if(!n){this._info("","This data-provider declares no tenantConfig — nothing to edit here.");return}let o=await m(`/api/namespaces/tenants/config?tenantId=${encodeURIComponent(e)}`);this._renderForm(n,o?.config??{})}_renderForm(e,t){this._root.innerHTML="";let r=document.createElement("form"),n=document.createElement("hub-config-form");n.setAttribute("mode","control-plane"),n.setAttribute("prefix","providerConfig"),n.setAttribute("schema",JSON.stringify(e)),n.setAttribute("value",JSON.stringify(t)),r.appendChild(n);let o=document.createElement("p9r-button");o.setAttribute("color","primary"),o.setAttribute("type","submit"),o.textContent="Save config",r.appendChild(o);let i=document.createElement("div");i.className="msg",r.appendChild(i),r.addEventListener("submit",async(l)=>{l.preventDefault(),i.innerHTML="";let d=await s("PATCH",`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,{providerConfig:n.getValues()}),c=document.createElement("p9r-alert");if(d.ok)c.setAttribute("type","success"),c.textContent="Config saved.",document.dispatchEvent(new CustomEvent("tenant:updated",{bubbles:!0}));else c.setAttribute("type","error"),c.textContent=`Failed: ${d.message}`;i.appendChild(c)}),this._root.appendChild(r)}}if(!customElements.get("hub-tenant-config-form"))customElements.define("hub-tenant-config-form",T);var j=`:host { display: block; }

[part="root"] {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.msg:empty { display: none; }
`;class q extends a{constructor(){super({css:j,template:"<div part='root'></div>"})}connectedCallback(){this._render()}get _namespaceId(){return this.getAttribute("namespace-id")||u("namespaceId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}async _render(){let e=this._root;e.textContent="Loading data-providers…";let r=(await m("/api/providers"))?.providers??[];if(e.innerHTML="",r.length===0){let d=document.createElement("p9r-alert");d.setAttribute("type","info"),d.innerHTML='No data-provider imported. <a href="../providers/">Import one first</a>.',e.appendChild(d);return}let n=document.createElement("p9r-select");n.setAttribute("name","providerId"),n.setAttribute("label","Data-provider");for(let d of r){let c=document.createElement("option");c.value=d.providerId,c.textContent=d.providerKind?`${d.providerId} (${d.providerKind})`:d.providerId,n.appendChild(c)}let o=document.createElement("p9r-input");o.setAttribute("name","displayName"),o.setAttribute("label","Display name (optional)");let i=document.createElement("p9r-button");i.setAttribute("color","primary"),i.textContent="Create tenant",i.addEventListener("click",()=>void this._create(n,o,i));let l=document.createElement("div");l.className="msg",e.append(n,o,i,l)}async _create(e,t,r){let n=this.shadowRoot.querySelector(".msg");n.innerHTML="";let o=e.value??e.getAttribute("value")??"";if(!o){this._error(n,"Pick a data-provider.");return}let i=(t.value??t.getAttribute("value")??"").trim();r.setAttribute("disabled","");let l=`/api/namespaces/tenants?namespaceId=${encodeURIComponent(this._namespaceId)}&providerId=${encodeURIComponent(o)}`,d=await s("POST",l,{issuers:[],...i?{displayName:i}:{}});if(r.removeAttribute("disabled"),d.ok)document.dispatchEvent(new CustomEvent("tenant:created",{bubbles:!0})),this.dispatchEvent(new CustomEvent("form:success",{bubbles:!0,composed:!0}));else this._error(n,d.message)}_error(e,t){let r=document.createElement("p9r-alert");r.setAttribute("type","error"),r.textContent=`Failed: ${t}`,e.appendChild(r)}}if(!customElements.get("hub-add-tenant"))customElements.define("hub-add-tenant",q);var J=`:host { display: block; }

[part="root"] { display: flex; flex-direction: column; gap: 1rem; }

.bar { display: flex; gap: 1rem; flex-wrap: wrap; align-items: end; }

/* Keep the filter dropdowns a stable width — otherwise the host collapses to
 * the chevron when "All" is selected and jumps around on each change. */
.bar p9r-select { display: inline-block; min-width: 9rem; }

.rows {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-default);
    border-radius: 8px;
    background: var(--bg-surface);
    overflow: auto;
    max-height: 28rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
}
.rows:empty { display: none; }

.row {
    display: grid;
    grid-template-columns: 12rem 5.5rem 4rem 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border-light, var(--border-default));
    color: var(--text-body);
}
.row:last-child { border-bottom: 0; }

.ts { color: var(--text-muted); white-space: nowrap; }

.tag {
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--text-label, var(--text-muted));
}

.event { color: var(--text-main); word-break: break-word; }
.meta  { color: var(--text-muted); white-space: nowrap; }

/* Level accent via the theme status tokens — no hardcoded colors. */
.row.level-warn  .tag.level { color: var(--warning-base); }
.row.level-error .tag.level { color: var(--danger-base); }
.row.level-info  .tag.level { color: var(--info-base); }

.empty[hidden], .more[hidden] { display: none; }
.more { align-self: flex-start; }
`;class N extends a{_items=[];_cursor=void 0;_kind="";_level="";_onTenantEvent=()=>{this._load(!0)};constructor(){super({css:J,template:"<div part='root'></div>"})}connectedCallback(){this._renderShell(),this._load(!0);for(let e of["tenant:created","tenant:updated","tenant:removed"])document.addEventListener(e,this._onTenantEvent)}disconnectedCallback(){for(let e of["tenant:created","tenant:updated","tenant:removed"])document.removeEventListener(e,this._onTenantEvent)}get _src(){return this.getAttribute("src")||""}get _root(){return this.shadowRoot.querySelector("[part='root']")}_scopeParam(){for(let e of["tenantId","providerId","namespaceId"]){let t=u(e);if(t)return`${e}=${encodeURIComponent(t)}`}return""}_renderShell(){let e=this._root;e.innerHTML="";let t=document.createElement("div");t.className="bar",t.append(this._select("kind","Kind",["all","security","audit","request"],(i)=>{this._kind=i,this._load(!0)}),this._select("level","Level",["all","debug","info","warn","error"],(i)=>{this._level=i,this._load(!0)}));let r=document.createElement("div");r.className="rows";let n=document.createElement("p9r-button");n.setAttribute("variant","ghost"),n.className="more",n.textContent="Load more",n.addEventListener("click",()=>void this._load(!1));let o=document.createElement("p9r-alert");o.setAttribute("type","info"),o.className="empty",o.textContent="No log entries.",e.append(t,r,o,n)}_select(e,t,r,n){let o=document.createElement("p9r-select");o.setAttribute("name",e),o.setAttribute("label",t);for(let i of r){let l=document.createElement("option");if(l.value=i,l.textContent=i==="all"?"All":i,i==="all")l.setAttribute("selected","");o.appendChild(l)}return o.addEventListener("change",()=>{let i=o.value??o.getAttribute("value")??"all";n(i==="all"?"":i)}),o}async _load(e){if(e)this._items=[],this._cursor=void 0;let t=this._scopeParam();if(!this._src||!t)return;let r=new URLSearchParams(t);if(this._kind)r.set("kind",this._kind);if(this._level)r.set("level",this._level);if(r.set("limit","50"),this._cursor)r.set("cursor",this._cursor);let o=await m(`${this._src}?${r.toString()}`)??{items:[],nextCursor:void 0};this._items=e?o.items:[...this._items,...o.items],this._cursor=o.nextCursor,this._renderRows()}_renderRows(){let e=this.shadowRoot.querySelector(".rows"),t=this.shadowRoot.querySelector(".empty"),r=this.shadowRoot.querySelector(".more");e.innerHTML="",t.hidden=this._items.length>0,r.hidden=!this._cursor;for(let n of this._items){let o=document.createElement("div");o.className=`row level-${n.level}`,o.innerHTML=`
                <span class="ts">${this._esc(n.ts)}</span>
                <span class="tag kind">${this._esc(n.kind)}</span>
                <span class="tag level">${this._esc(n.level)}</span>
                <span class="event">${this._esc(n.event)}</span>
                <span class="meta">${this._esc(n.outcome??"")}${n.tenantId?" · "+this._esc(n.tenantId):""}</span>`,e.appendChild(o)}}_esc(e){return String(e).replace(/[&<>"]/g,(t)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}}if(!customElements.get("hub-logs"))customElements.define("hub-logs",N);function me(e){if(!e)return"An error occurred.";let t=e.body;if(t&&typeof t==="object"&&t.error){let r=t.error;return`${r.code||"error"}: ${r.message||""}`.trim()}return`HTTP ${e.status??"?"}`}function ue(e){let t=e.querySelector(":scope > p9r-alert.hub-form-error");if(!t)t=document.createElement("p9r-alert"),t.setAttribute("type","error"),t.classList.add("hub-form-error"),e.appendChild(t);return t}document.addEventListener("form:failed",(e)=>{let t=e.target;if(!(t instanceof Element))return;let r=t.closest("p9r-modal")||t.closest("dialog")||t.parentElement||document.body;ue(r).textContent=me(e.detail)});document.addEventListener("form:success",(e)=>{let t=e.target;if(!(t instanceof Element))return;(t.closest("p9r-modal")||t.parentElement)?.querySelector(":scope > p9r-alert.hub-form-error")?.remove()});})();
