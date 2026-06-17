/* Click-to-comment review overlay for the hosted HTML deck (Google-Docs style).
   Static-hosting friendly: comments live in the reviewer's browser (localStorage)
   and are shared by "Copy link" / "Copy as Markdown" / Export — no backend.
   Injected into the built deck by scripts/inject_review.py. */
(function () {
  if (window.__nrLoaded) return; window.__nrLoaded = true;

  var KEY = "nilm-review::" + location.pathname;
  var state = load();
  var armed = false;
  var openId = null;

  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.comments) return s; } catch (e) {}
    return { author: "", comments: [] };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} render(); }
  function uid() { return "c" + Math.random().toString(36).slice(2, 9) + (state.comments.length); }
  function enc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
  function dec(s) { return JSON.parse(decodeURIComponent(escape(atob(s)))); }

  // ---- slide geometry -------------------------------------------------------
  function slides() { return [].slice.call(document.querySelectorAll(".bespoke-marp-slide")); }
  function isOverview() { var p = document.querySelector(".bespoke-marp-parent"); return p && /bespoke-marp-overview(\s|$)/.test(p.className); }
  function activeSlide() {
    var el = document.querySelector(".bespoke-marp-slide.bespoke-marp-active");
    if (el) return el;
    var cx = innerWidth / 2, cy = innerHeight / 2, hit = null;
    slides().forEach(function (s) { var r = s.getBoundingClientRect(); if (r.width && r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy) hit = s; });
    return hit || slides()[0] || null;
  }
  function activeIndex() { var a = activeSlide(); return a ? slides().indexOf(a) : -1; }
  function svgOf(slide) { return slide ? slide.querySelector("svg[data-marpit-svg]") || slide : null; }
  function rectOf(idx) { var s = slides()[idx]; var g = svgOf(s); return g ? g.getBoundingClientRect() : null; }
  function slideTitle(idx) {
    var s = slides()[idx]; if (!s) return "";
    var h = s.querySelector("h2, h1"); return h ? h.textContent.trim() : "";
  }

  // ---- DOM scaffold ---------------------------------------------------------
  var fab = el("div", "", { id: "nr-fab" });
  fab.innerHTML = '<span class="nr-dot"></span><span class="nr-label">Comment</span> <span class="nr-count"></span>';
  var pins = el("div", "", { id: "nr-pins" });
  var capture = el("div", "nr-hidden", { id: "nr-capture" });
  document.body.appendChild(fab); document.body.appendChild(pins); document.body.appendChild(capture);

  fab.addEventListener("click", function (e) {
    if (e.shiftKey) { togglePanel(); return; }
    setArmed(!armed);
  });
  fab.addEventListener("contextmenu", function (e) { e.preventDefault(); togglePanel(); });

  capture.addEventListener("click", function (e) {
    var idx = activeIndex(); var r = rectOf(idx); if (!r) return;
    var fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    var c = { id: uid(), slide: idx, fx: fx, fy: fy, text: "", author: state.author || "", ts: Date.now() };
    state.comments.push(c); persist(); setArmed(false); openPopover(c.id, true);
  });

  function setArmed(v) {
    armed = v; fab.classList.toggle("nr-armed", v);
    fab.querySelector(".nr-label").textContent = v ? "Click on slide…" : "Comment";
    if (!v) { capture.classList.add("nr-hidden"); }
    layout();
  }

  // ---- pins + capture positioning (cheap interval keeps it correct during nav) ----
  function layout() {
    var idx = activeIndex();
    var over = isOverview();
    // capture layer over the active slide
    if (armed && !over) {
      var r = rectOf(idx);
      if (r) { capture.classList.remove("nr-hidden"); css(capture, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); }
    } else capture.classList.add("nr-hidden");
    // pins for the active slide only
    var have = {};
    state.comments.forEach(function (c) {
      if (c.slide !== idx || over) return;
      var rr = rectOf(idx); if (!rr) return;
      have[c.id] = 1;
      var p = document.getElementById("nr-pin-" + c.id);
      if (!p) {
        p = el("div", "nr-pin", { id: "nr-pin-" + c.id });
        p.innerHTML = "<span></span>";
        p.addEventListener("click", function (ev) { ev.stopPropagation(); openPopover(c.id, false); });
        pins.appendChild(p);
      }
      p.classList.toggle("nr-active", openId === c.id);
      var n = state.comments.filter(function (x) { return x.slide === idx; }).indexOf(c) + 1;
      p.firstChild.textContent = n;
      css(p, { left: (rr.left + c.fx * rr.width) + "px", top: (rr.top + c.fy * rr.height) + "px" });
    });
    [].slice.call(pins.children).forEach(function (p) { if (!have[p.id.replace("nr-pin-", "")]) p.remove(); });
    if (openId) positionPopover();
  }
  setInterval(layout, 120);
  addEventListener("resize", layout); addEventListener("scroll", layout, true);

  // ---- popover (view/edit a single comment) ---------------------------------
  var pop = null;
  function openPopover(id, focus) {
    closePopover(); openId = id;
    var c = byId(id); if (!c) return;
    pop = el("div", "", { id: "nr-pop" });
    pop.innerHTML =
      '<div class="nr-meta">Slide ' + (c.slide + 1) + (slideTitle(c.slide) ? " · " + esc(slideTitle(c.slide)) : "") + '</div>' +
      '<textarea placeholder="Type a comment…"></textarea>' +
      '<div class="nr-row"><button class="nr-btn nr-danger" data-act="del">Delete</button><span class="nr-grow"></span>' +
      '<button class="nr-btn" data-act="cancel">Close</button><button class="nr-btn nr-primary" data-act="save">Save</button></div>';
    document.body.appendChild(pop);
    var ta = pop.querySelector("textarea"); ta.value = c.text || "";
    pop.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-act"); if (!a) return;
      if (a === "save") { c.text = ta.value.trim(); c.author = state.author || c.author || ""; if (!c.text) removeC(id); else persist(); closePopover(); }
      else if (a === "del") { removeC(id); closePopover(); }
      else if (a === "cancel") { if (!c.text.trim()) removeC(id); closePopover(); }
    });
    positionPopover(); if (focus) ta.focus();
  }
  function positionPopover() {
    if (!pop) return; var c = byId(openId); if (!c) { closePopover(); return; }
    var rr = rectOf(c.slide); if (!rr) return;
    var x = rr.left + c.fx * rr.width, y = rr.top + c.fy * rr.height;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), innerWidth - w - 8);
    var top = Math.min(Math.max(8, y + 14), innerHeight - h - 8);
    css(pop, { left: left + "px", top: top + "px" });
  }
  function closePopover() { if (pop) pop.remove(); pop = null; openId = null; }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePopover(); setArmed(false); } });
  document.addEventListener("mousedown", function (e) {
    if (pop && !pop.contains(e.target) && !/nr-pin/.test(e.target.className || "")) {
      var c = byId(openId); if (c && !(c.text || "").trim()) removeC(openId);
      closePopover();
    }
  });

  // ---- side panel -----------------------------------------------------------
  var panel = null;
  function togglePanel() { if (panel) { panel.remove(); panel = null; return; } buildPanel(); }
  function buildPanel() {
    panel = el("div", "", { id: "nr-panel" });
    panel.innerHTML =
      '<header><div class="nr-title">Review comments</div><div class="nr-sub"></div></header>' +
      '<div class="nr-name">Your name <input type="text" placeholder="optional"></div>' +
      '<div id="nr-list"></div>' +
      '<footer>' +
      '<button class="nr-btn nr-primary" data-act="md">Copy as Markdown</button>' +
      '<button class="nr-btn" data-act="link">Copy share link</button>' +
      '<button class="nr-btn" data-act="export">Export .json</button>' +
      '<button class="nr-btn" data-act="import">Import .json</button>' +
      '<button class="nr-btn nr-danger" data-act="clear">Clear all</button>' +
      '<button class="nr-btn" data-act="close">Close</button>' +
      '</footer>';
    document.body.appendChild(panel);
    var nm = panel.querySelector(".nr-name input"); nm.value = state.author || "";
    nm.addEventListener("input", function () { state.author = nm.value.trim(); persistQuiet(); });
    panel.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-act"); if (!a) return;
      if (a === "close") togglePanel();
      else if (a === "md") copy(toMarkdown(), "Markdown copied — paste it to share");
      else if (a === "link") shareLink();
      else if (a === "export") exportJson();
      else if (a === "import") importJson();
      else if (a === "clear") { if (confirm("Delete all " + state.comments.length + " comments on this deck?")) { state.comments = []; persist(); } }
    });
    render();
  }
  function render() {
    var n = state.comments.length;
    fab.querySelector(".nr-count").textContent = n ? "· " + n : "";
    if (!panel) return;
    panel.querySelector(".nr-sub").textContent = n + (n === 1 ? " comment" : " comments") + " · stored in this browser";
    var list = panel.querySelector("#nr-list");
    if (!n) { list.innerHTML = '<div class="nr-empty">No comments yet.<br>Click <b>Comment</b>, then click a point on a slide.</div>'; return; }
    var srt = state.comments.slice().sort(function (a, b) { return a.slide - b.slide || a.ts - b.ts; });
    list.innerHTML = "";
    srt.forEach(function (c) {
      var it = el("div", "nr-item");
      it.innerHTML = '<div class="nr-where">Slide ' + (c.slide + 1) + (slideTitle(c.slide) ? " · " + esc(slideTitle(c.slide)) : "") + '</div>' +
        '<div class="nr-txt">' + esc(c.text || "(empty)") + '</div>' +
        (c.author ? '<div class="nr-who">— ' + esc(c.author) + '</div>' : "");
      it.addEventListener("click", function () { gotoSlide(c.slide); setTimeout(function () { openPopover(c.id, false); }, 380); });
      list.appendChild(it);
    });
  }
  function persistQuiet() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // ---- navigation + sharing -------------------------------------------------
  function gotoSlide(idx) { try { location.hash = "#" + (idx + 1); } catch (e) {} }
  function toMarkdown() {
    var srt = state.comments.slice().sort(function (a, b) { return a.slide - b.slide || a.ts - b.ts; });
    var out = ["## Review — " + document.title, ""];
    srt.forEach(function (c) {
      out.push("- **Slide " + (c.slide + 1) + (slideTitle(c.slide) ? " (" + slideTitle(c.slide) + ")" : "") + "**: " +
        (c.text || "").replace(/\n/g, " ") + (c.author ? "  — _" + c.author + "_" : ""));
    });
    return out.join("\n");
  }
  function shareLink() {
    var code = enc(state.comments);
    var url = location.origin + location.pathname + "?review=" + encodeURIComponent(code);
    if (url.length > 7500) { copy(url, "Link copied (long — Export .json is more reliable)"); }
    else copy(url, "Share link copied — send it; opening it shows these pins");
  }
  function exportJson() {
    var blob = new Blob([JSON.stringify(state.comments, null, 2)], { type: "application/json" });
    var a = el("a", "", { href: URL.createObjectURL(blob), download: "nilmbench-review.json" });
    document.body.appendChild(a); a.click(); a.remove(); toast("Exported nilmbench-review.json");
  }
  function importJson() {
    var inp = el("input", "", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { try { merge(JSON.parse(rd.result)); toast("Imported comments"); } catch (e) { toast("Could not read that file"); } };
      rd.readAsText(f);
    });
    inp.click();
  }
  function merge(arr) {
    if (!Array.isArray(arr)) return; var seen = {}; state.comments.forEach(function (c) { seen[c.id] = 1; });
    arr.forEach(function (c) { if (c && c.id && !seen[c.id] && typeof c.slide === "number") { state.comments.push(c); seen[c.id] = 1; } });
    persist();
  }

  // ---- helpers --------------------------------------------------------------
  function byId(id) { for (var i = 0; i < state.comments.length; i++) if (state.comments[i].id === id) return state.comments[i]; return null; }
  function removeC(id) { state.comments = state.comments.filter(function (c) { return c.id !== id; }); persist(); }
  function el(t, cls, attrs) { var e = document.createElement(t); if (cls) e.className = cls; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function css(e, o) { for (var k in o) e.style[k] = o[k]; }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
    else fallback();
    function fallback() { var ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed — select & copy manually"); } ta.remove(); }
  }
  var toastT = null;
  function toast(m) { var t = document.getElementById("nr-toast") || el("div", "", { id: "nr-toast" }); t.textContent = m; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 2600); }

  // ---- incoming shared link -------------------------------------------------
  try {
    var u = new URL(location.href); var inc = u.searchParams.get("review");
    if (inc) { merge(dec(decodeURIComponent(inc))); u.searchParams.delete("review"); history.replaceState(null, "", u.pathname + u.search + u.hash); setTimeout(function () { toast("Loaded shared comments"); }, 600); }
  } catch (e) {}

  render();
})();
