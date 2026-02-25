/* Static Wiki — no server
   Storage model:
   - On start: fetch ./articles.json (same folder)
   - If not found: empty list
   - Editing: updates in-memory
   - Export: downloads new articles.json
   - Optional import: file input for quick testing
*/

const $ = (sel) => document.querySelector(sel);

const els = {
  brand: $("#brand"),
  searchInput: $("#searchInput"),
  clearSearch: $("#clearSearch"),

  editGateBadge: $("#editGateBadge"),
  createBtn: $("#createBtn"),
  downloadBtn: $("#downloadBtn"),
  editBtn: $("#editBtn"),

  importFile: $("#importFile"),

  tocBox: $("#tocBox"),
  toc: $("#toc"),

  viewHome: $("#viewHome"),
  viewArticle: $("#viewArticle"),
  viewEditor: $("#viewEditor"),
  viewAbout: $("#viewAbout"),
  viewNotFound: $("#viewNotFound"),

  articlesList: $("#articlesList"),

  articleTitle: $("#articleTitle"),
  articleMeta: $("#articleMeta"),
  articleBody: $("#articleBody"),

  editorModeTitle: $("#editorModeTitle"),
  editorTitle: $("#editorTitle"),
  editor: $("#editor"),
  saveEditBtn: $("#saveEditBtn"),
  cancelEditBtn: $("#cancelEditBtn"),

  headingSelect: $("#headingSelect"),
  linkBtn: $("#linkBtn"),
  extLinkBtn: $("#extLinkBtn"),
  imageBtn: $("#imageBtn"),
  quoteBtn: $("#quoteBtn"),
  hrBtn: $("#hrBtn"),
  cleanBtn: $("#cleanBtn"),
};

const STATE = {
  data: { version: 1, exportedAt: null, articles: [] },
  loadedFromFile: false,
  gateUnlocked: false,
  logoClicks: 0,
  logoLastClickAt: 0,

  currentRoute: { name: "home", arg: null },
  currentArticleId: null, // for viewing
  editingArticleId: null, // for editing
};

function nowISO(){
  return new Date().toISOString();
}

function slugifyTitle(title){
  // Keep it predictable for hash routes; still use full title as key
  return title.trim();
}

function normalizeTitle(title){
  return title.trim().replace(/\s+/g, " ");
}

function findArticleByTitle(title){
  const t = normalizeTitle(title);
  return STATE.data.articles.find(a => normalizeTitle(a.title) === t) || null;
}

function findArticleIndexById(id){
  return STATE.data.articles.findIndex(a => a.id === id);
}

function escapeHTML(str){
  return str.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[m]));
}

/** Minimal sanitization (because contenteditable is a chaos gremlin)
 * - removes <script> tags
 * - removes on* attributes
 * - disallows javascript: in href/src
 */
function sanitizeHTML(html){
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  // remove scripts
  tpl.content.querySelectorAll("script").forEach(s => s.remove());

  // remove dangerous attrs
  const all = tpl.content.querySelectorAll("*");
  all.forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value || "";
      if(name.startsWith("on")) el.removeAttribute(attr.name);
      if((name === "href" || name === "src") && value.trim().toLowerCase().startsWith("javascript:")){
        el.removeAttribute(attr.name);
      }
      // optional: prevent style injection; uncomment if надо жёстко
      // if(name === "style") el.removeAttribute("style");
    });
  });

  return tpl.innerHTML;
}

async function loadArticlesJSON(){
  try{
    const res = await fetch("./articles.json", { cache: "no-store" });
    if(!res.ok) throw new Error("articles.json not found");
    const json = await res.json();
    if(!json || typeof json !== "object") throw new Error("Invalid JSON");

    // Basic validation
    if(!Array.isArray(json.articles)) json.articles = [];
    if(typeof json.version !== "number") json.version = 1;

    // Ensure fields
    json.articles = json.articles.map(a => ({
      id: a.id || crypto.randomUUID(),
      title: typeof a.title === "string" ? a.title : "Без названия",
      html: typeof a.html === "string" ? a.html : "",
      createdAt: a.createdAt || nowISO(),
      updatedAt: a.updatedAt || a.createdAt || nowISO(),
    }));

    STATE.data = json;
    STATE.loadedFromFile = true;
  }catch(e){
    // Empty start is ok
    STATE.data = { version: 1, exportedAt: null, articles: [] };
    STATE.loadedFromFile = false;
  }
}

function setGateUnlocked(unlocked){
  STATE.gateUnlocked = unlocked;
  sessionStorage.setItem("wiki_gate_unlocked", unlocked ? "1" : "0");
  els.editGateBadge.textContent = unlocked ? "Редактор: 🔓" : "Редактор: 🔒";

  els.createBtn.classList.toggle("hidden", !unlocked);
  els.downloadBtn.classList.toggle("hidden", !unlocked);

  // Edit button depends on route too; update later in render
  renderRoute();
}

function initGate(){
  const v = sessionStorage.getItem("wiki_gate_unlocked");
  setGateUnlocked(v === "1");
}

function handleLogoClick(){
  const t = Date.now();
  // reset if pause too long
  if(t - STATE.logoLastClickAt > 2500){
    STATE.logoClicks = 0;
  }
  STATE.logoLastClickAt = t;
  STATE.logoClicks++;

  // 10 taps unlock
  if(STATE.logoClicks >= 10){
    STATE.logoClicks = 0;
    setGateUnlocked(true);
    toast("Редактор разблокирован. Теперь ты официально избранный. Остальные пусть страдают.");
  }else{
    // tiny feedback: badge blink
    els.editGateBadge.style.transform = "scale(1.03)";
    setTimeout(()=> els.editGateBadge.style.transform = "", 120);
  }
}

function toast(msg){
  // Minimal toast without extra libs
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.right = "16px";
  el.style.bottom = "18px";
  el.style.maxWidth = "420px";
  el.style.padding = "12px 14px";
  el.style.border = "1px solid #e2e8f0";
  el.style.borderRadius = "14px";
  el.style.background = "rgba(255,255,255,.92)";
  el.style.backdropFilter = "blur(10px)";
  el.style.boxShadow = "0 12px 30px rgba(15,23,42,.12)";
  el.style.zIndex = "9999";
  el.style.fontSize = "14px";
  document.body.appendChild(el);
  setTimeout(()=> {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "200ms";
  }, 2800);
  setTimeout(()=> el.remove(), 3400);
}

function routeFromHash(){
  const raw = (location.hash || "#/").slice(2); // remove "#/"
  if(!raw) return { name:"home", arg:null };

  const parts = raw.split("/");
  const head = decodeURIComponent(parts[0] || "");

  if(head === "") return { name:"home", arg:null };
  if(head === "about") return { name:"about", arg:null };
  if(head === "random") return { name:"random", arg:null };
  if(head === "edit") {
    const title = decodeURIComponent(parts.slice(1).join("/") || "");
    return { name:"edit", arg:title || null };
  }

  // article by title
  return { name:"article", arg: decodeURIComponent(raw) };
}

function showView(which){
  const views = [els.viewHome, els.viewArticle, els.viewEditor, els.viewAbout, els.viewNotFound];
  views.forEach(v => v.classList.add("hidden"));
  which.classList.remove("hidden");
}

function formatDate(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }catch{
    return iso || "";
  }
}

function renderHome(){
  els.tocBox.classList.add("hidden");

  showView(els.viewHome);

  const q = (els.searchInput.value || "").trim().toLowerCase();
  const list = STATE.data.articles
    .slice()
    .sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .filter(a => !q || a.title.toLowerCase().includes(q));

  if(list.length === 0){
    els.articlesList.innerHTML = `
      <div class="muted">
        ${q ? "Ничего не найдено." : "Пока нет статей."}
      </div>
    `;
    return;
  }

  els.articlesList.innerHTML = list.map(a => {
    const href = `#/${encodeURIComponent(slugifyTitle(a.title))}`;
    return `
      <div class="listItem">
        <div class="listItem__left">
          <a class="listItem__title" href="${href}">${escapeHTML(a.title)}</a>
          <div class="listItem__meta">обновлено: ${escapeHTML(formatDate(a.updatedAt))}</div>
        </div>
        <div class="listItem__meta">id: ${escapeHTML(a.id.slice(0,8))}</div>
      </div>
    `;
  }).join("");
}

function applyInternalLinkHandling(container){
  // Convert internal links to hash routes if they look like "#/Title" already — ok.
  // Also allow wiki-style data-article-title.
  container.querySelectorAll("a[data-article-title]").forEach(a => {
    const t = a.getAttribute("data-article-title") || "";
    a.setAttribute("href", `#/${encodeURIComponent(t)}`);
  });
}

function buildTOCFromArticle(container){
  const headings = [...container.querySelectorAll("h2, h3, h4")];
  if(headings.length === 0){
    els.tocBox.classList.add("hidden");
    els.toc.innerHTML = "";
    return;
  }

  // ensure ids
  const used = new Set();
  headings.forEach(h => {
    let base = (h.textContent || "").trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu,"")
      .replace(/\s+/g,"-")
      .slice(0, 60) || "section";
    let id = base;
    let i = 2;
    while(used.has(id) || document.getElementById(id)) {
      id = `${base}-${i++}`;
    }
    used.add(id);
    h.id = h.id || id;
  });

  els.toc.innerHTML = `
    <div class="mutedLabel">Разделы</div>
    ${headings.map(h => {
      const lvl = h.tagName.toLowerCase();
      const cls = lvl === "h3" ? "lvl3" : (lvl === "h4" ? "lvl4" : "");
      return `<a class="${cls}" href="#${location.hash.split("#")[1] ? location.hash : "#/"}" data-scroll="${h.id}">${escapeHTML(h.textContent.trim())}</a>`;
    }).join("")}
  `;

  els.tocBox.classList.remove("hidden");

  // Custom scroll behavior (don’t break routing)
  els.toc.querySelectorAll("a[data-scroll]").forEach(a => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = a.getAttribute("data-scroll");
      const target = document.getElementById(id);
      if(target) target.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  });
}

function renderArticle(title){
  const art = findArticleByTitle(title);
  if(!art){
    els.tocBox.classList.add("hidden");
    showView(els.viewNotFound);
    return;
  }

  STATE.currentArticleId = art.id;

  showView(els.viewArticle);

  els.articleTitle.textContent = art.title;
  els.articleMeta.textContent = `создано: ${formatDate(art.createdAt)} • обновлено: ${formatDate(art.updatedAt)}`;

  const safe = sanitizeHTML(art.html || "");
  els.articleBody.innerHTML = safe;

  applyInternalLinkHandling(els.articleBody);
  buildTOCFromArticle(els.articleBody);

  // edit button gate
  els.editBtn.classList.toggle("hidden", !STATE.gateUnlocked);
}

function renderAbout(){
  els.tocBox.classList.add("hidden");
  showView(els.viewAbout);
}

function renderRandom(){
  const list = STATE.data.articles;
  if(list.length === 0){
    location.hash = "#/";
    toast("Случайная статья не нашлась (потому что статей нет). Логично. Жёстко. Честно.");
    return;
  }
  const pick = list[Math.floor(Math.random() * list.length)];
  location.hash = `#/${encodeURIComponent(pick.title)}`;
}

function renderNotFound(){
  els.tocBox.classList.add("hidden");
  showView(els.viewNotFound);
}

function renderRoute(){
  const r = routeFromHash();
  STATE.currentRoute = r;

  // default: hide edit button
  els.editBtn.classList.add("hidden");

  if(r.name === "home") return renderHome();
  if(r.name === "about") return renderAbout();
  if(r.name === "random") return renderRandom();
  if(r.name === "edit") return openEditor(r.arg);
  if(r.name === "article") return renderArticle(r.arg);

  return renderNotFound();
}

// ===== Editor helpers =====
function exec(cmd, value=null){
  document.execCommand(cmd, false, value);
  els.editor.focus();
}

function wrapSelectionWithTag(tagName){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  const el = document.createElement(tagName);
  el.appendChild(range.extractContents());
  range.insertNode(el);

  // move caret after
  range.setStartAfter(el);
  range.setEndAfter(el);
  sel.removeAllRanges();
  sel.addRange(range);
  els.editor.focus();
}

function insertHTML(html){
  exec("insertHTML", html);
}

function pickArticleTitleDialog(){
  const titles = STATE.data.articles.map(a => a.title).sort((a,b)=>a.localeCompare(b, "ru"));
  const hint = titles.length ? `Доступные: ${titles.slice(0, 12).join(", ")}${titles.length>12?"…":""}` : "Пока статей нет.";
  const t = prompt(`Ссылка на статью. Введи точное название.\n${hint}`);
  if(!t) return null;
  return normalizeTitle(t);
}

function insertInternalLink(){
  const t = pickArticleTitleDialog();
  if(!t) return;

  const exists = !!findArticleByTitle(t);
  const label = window.getSelection()?.toString()?.trim() || t;

  // If article doesn't exist, still allow link — it will lead to NotFound (как в реальной вики до создания)
  insertHTML(`<a data-article-title="${escapeHTML(t)}" href="#/${encodeURIComponent(t)}">${escapeHTML(label)}${exists?"":" (нет)"}</a>`);
}

function insertExternalLink(){
  const url = prompt("Внешняя ссылка (https://...)");
  if(!url) return;
  const text = window.getSelection()?.toString()?.trim() || url;
  insertHTML(`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(text)}</a>`);
}

async function insertImageWithCaption(){
  // Let user choose: URL or file
  const mode = prompt("Картинка: введи URL (https://...) или напиши FILE чтобы выбрать файл.");
  if(!mode) return;

  if(mode.trim().toUpperCase() === "FILE"){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if(!file) return;
      const dataUrl = await fileToDataURL(file);
      const cap = prompt("Подпись под картинкой (можно пусто):") ?? "";
      const fig = `
        <figure>
          <img src="${dataUrl}" alt="${escapeHTML(cap)}" />
          <figcaption contenteditable="true">${escapeHTML(cap)}</figcaption>
        </figure>
      `;
      insertHTML(fig);
    };
    return;
  }

  const url = mode.trim();
  const cap = prompt("Подпись под картинкой (можно пусто):") ?? "";
  const fig = `
    <figure>
      <img src="${escapeHTML(url)}" alt="${escapeHTML(cap)}" />
      <figcaption contenteditable="true">${escapeHTML(cap)}</figcaption>
    </figure>
  `;
  insertHTML(fig);
}

function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function insertQuote(){
  const sel = window.getSelection()?.toString()?.trim();
  if(sel){
    insertHTML(`<blockquote>${escapeHTML(sel)}</blockquote>`);
  }else{
    insertHTML(`<blockquote>Текст цитаты…</blockquote>`);
  }
}

function insertHr(){
  insertHTML(`<hr />`);
}

function clearFormatting(){
  exec("removeFormat");
}

// ===== Open editor =====
function openEditor(titleOrNull){
  if(!STATE.gateUnlocked){
    toast("Редактор закрыт. 10 кликов по логотипу — и ты внутри. Не спрашивай почему, так надо.");
    // bounce back
    location.hash = "#/";
    return;
  }

  showView(els.viewEditor);
  els.tocBox.classList.add("hidden");

  const isNew = !titleOrNull;
  let art = null;

  if(!isNew){
    art = findArticleByTitle(titleOrNull);
  }

  if(art){
    STATE.editingArticleId = art.id;
    els.editorModeTitle.textContent = "Редактирование статьи";
    els.editorTitle.value = art.title;
    els.editor.innerHTML = art.html || "";
  }else{
    STATE.editingArticleId = null;
    els.editorModeTitle.textContent = "Создание статьи";
    els.editorTitle.value = titleOrNull ? normalizeTitle(titleOrNull) : "";
    els.editor.innerHTML = "";
  }

  // Make sure editor has at least a paragraph for nicer typing
  if(els.editor.innerHTML.trim() === ""){
    els.editor.innerHTML = "<p></p>";
  }

  // Focus title if empty else editor
  if(!els.editorTitle.value.trim()) els.editorTitle.focus();
  else els.editor.focus();
}

function saveEditor(){
  const title = normalizeTitle(els.editorTitle.value || "");
  if(!title){
    toast("Название статьи пустое. Википедия грустит и отказывается сохранять.");
    els.editorTitle.focus();
    return;
  }

  // prevent duplicates by title (unless editing same article)
  const existing = findArticleByTitle(title);
  if(existing && existing.id !== STATE.editingArticleId){
    toast("Статья с таким названием уже существует. Придумай другое или редактируй ту, что есть.");
    return;
  }

  const html = sanitizeHTML(els.editor.innerHTML || "");

  if(STATE.editingArticleId){
    const idx = findArticleIndexById(STATE.editingArticleId);
    if(idx >= 0){
      STATE.data.articles[idx] = {
        ...STATE.data.articles[idx],
        title,
        html,
        updatedAt: nowISO(),
      };
    }
  }else{
    STATE.data.articles.push({
      id: crypto.randomUUID(),
      title,
      html,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
  }

  toast("Сохранено в памяти. Теперь скачай articles.json, если хочешь “настоящую” сохранёнку.");
  location.hash = `#/${encodeURIComponent(title)}`;
}

function cancelEditor(){
  // Return to article if editing, else home
  if(STATE.editingArticleId){
    const idx = findArticleIndexById(STATE.editingArticleId);
    const art = idx >= 0 ? STATE.data.articles[idx] : null;
    location.hash = art ? `#/${encodeURIComponent(art.title)}` : "#/";
  }else{
    location.hash = "#/";
  }
}

function downloadArticles(){
  const exportObj = {
    version: 1,
    exportedAt: nowISO(),
    articles: STATE.data.articles.map(a => ({
      id: a.id,
      title: a.title,
      html: a.html,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "articles.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast("Скачано. Теперь просто замени файл articles.json рядом с index.html.");
}

function importArticlesFromFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const json = JSON.parse(reader.result);
      if(!json || !Array.isArray(json.articles)) throw new Error("bad format");

      json.articles = json.articles.map(a => ({
        id: a.id || crypto.randomUUID(),
        title: typeof a.title === "string" ? a.title : "Без названия",
        html: typeof a.html === "string" ? a.html : "",
        createdAt: a.createdAt || nowISO(),
        updatedAt: a.updatedAt || a.createdAt || nowISO(),
      }));

      STATE.data = { version: 1, exportedAt: json.exportedAt || null, articles: json.articles };
      toast("Импортировано в память вкладки. (Это для теста; “канон” всё равно через файл в папке.)");
      renderRoute();
    }catch(e){
      toast("Не удалось импортировать: файл не похож на articles.json");
    }
  };
  reader.readAsText(file);
}

// ===== Events =====
function wireEvents(){
  // Gate: 10 taps
  els.brand.addEventListener("click", handleLogoClick);

  // Search
  els.searchInput.addEventListener("input", () => {
    if(STATE.currentRoute.name !== "home") location.hash = "#/";
    else renderHome();
  });
  els.clearSearch.addEventListener("click", () => {
    els.searchInput.value = "";
    if(STATE.currentRoute.name !== "home") location.hash = "#/";
    else renderHome();
  });

  // Create
  els.createBtn.addEventListener("click", () => {
    location.hash = "#/edit";
  });

  // Download
  els.downloadBtn.addEventListener("click", downloadArticles);

  // Edit current article
  els.editBtn.addEventListener("click", () => {
    const art = STATE.data.articles.find(a => a.id === STATE.currentArticleId);
    if(!art) return;
    location.hash = `#/edit/${encodeURIComponent(art.title)}`;
  });

  // Editor actions
  els.saveEditBtn.addEventListener("click", saveEditor);
  els.cancelEditBtn.addEventListener("click", cancelEditor);

  // Toolbar commands
  document.querySelectorAll(".toolbtn[data-cmd]").forEach(btn => {
    btn.addEventListener("click", () => exec(btn.getAttribute("data-cmd")));
  });

  els.headingSelect.addEventListener("change", () => {
    const v = els.headingSelect.value;
    if(v === "p") exec("formatBlock", "p");
    else exec("formatBlock", v);
    els.headingSelect.value = "p";
  });

  els.linkBtn.addEventListener("click", insertInternalLink);
  els.extLinkBtn.addEventListener("click", insertExternalLink);
  els.imageBtn.addEventListener("click", insertImageWithCaption);
  els.quoteBtn.addEventListener("click", insertQuote);
  els.hrBtn.addEventListener("click", insertHr);
  els.cleanBtn.addEventListener("click", clearFormatting);

  // Hash routing
  window.addEventListener("hashchange", renderRoute);

  // Optional import
  els.importFile.addEventListener("change", () => {
    const f = els.importFile.files?.[0];
    if(f) importArticlesFromFile(f);
    els.importFile.value = "";
  });

  // Make internal links inside article body use smooth scroll for same-page ids if any
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a");
    if(!a) return;
    const href = a.getAttribute("href") || "";
    // internal anchor inside article (not route)
    if(href.startsWith("#") && !href.startsWith("#/")){
      const id = href.slice(1);
      const t = document.getElementById(id);
      if(t){
        e.preventDefault();
        t.scrollIntoView({behavior:"smooth", block:"start"});
      }
    }
  });
}

async function main(){
  wireEvents();
  initGate();

  await loadArticlesJSON();

  // show a tiny hint if file missing (not an error)
  if(!STATE.loadedFromFile){
    // no toast spam, just quiet badge wiggle
    els.editGateBadge.title = "articles.json не найден или пустой — это нормально для первого запуска";
  }

  if(!location.hash) location.hash = "#/";
  renderRoute();
}

main();