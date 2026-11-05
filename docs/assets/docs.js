// docs-workflow — JS dùng chung cho tài liệu HTML trong docs/. Không thư viện ngoài.
// Trang đọc trực tiếp nguồn thật (markdown, config.defaults.json) → một nguồn sự thật, không chép số liệu.
// Mở qua server tĩnh ở GỐC repo: `python3 -m http.server 4590` → http://127.0.0.1:4590/docs/index.html
export const PAGES = [
  ["index.html", "Overview"],
  ["how-it-works.html", "How it works"],
  ["setup.html", "Setup"],
  ["submission.html", "Submission"],
  ["workmap.html", "Workmap"],
];

export function renderNav() {
  const here = location.pathname.split("/").pop() || "index.html";
  const nav = document.createElement("nav");
  nav.className = "topnav";
  nav.setAttribute("aria-label", "PayPal Invoice Copilot docs");
  nav.innerHTML = `<div class="in"><a class="brand" href="index.html">PayPal Invoice Copilot docs</a>${PAGES.map(([href, label]) =>
    `<a class="p" href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</div>`;
  document.body.prepend(nav);
  bustDiagramCache();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Markdown inline tối giản: `code`, **bold**, [text](url). Đủ cho bảng trong docs/shared/*.md.
export function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
}

export async function loadText(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`không đọc được ${path} (${r.status})`);
  return r.text();
}
export async function loadJSON(path) { return JSON.parse(await loadText(path)); }

// Lấy các bảng markdown trong văn bản → [{ headers, rows }]. Ô có `\|` được giữ nguyên dấu |.
export function mdTables(md) {
  const out = []; let cur = null;
  const cells = (line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  for (const line of md.split("\n")) {
    if (/^\s*\|/.test(line)) {
      if (!cur) { cur = { headers: cells(line), rows: [] }; continue; }
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      cur.rows.push(cells(line));
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

export function tableHTML({ headers, rows }, { filter } = {}) {
  const body = (filter ? rows.filter(filter) : rows);
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${mdInline(h)}</th>`).join("")}</tr></thead><tbody>${
    body.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// Bảng key → value phẳng cho object config (vd config.limits).
export function kvTable(obj, notes = {}) {
  return `<div class="table-scroll"><table><thead><tr><th>Khoá</th><th>Mặc định</th><th>Ý nghĩa</th></tr></thead><tbody>${
    Object.entries(obj).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</code></td><td>${mdInline(notes[k] || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

export function fail(el, e) {
  el.innerHTML = `<p class="load-error">⚠️ ${esc(e.message || e)} — mở trang qua server tĩnh ở gốc repo: <code>python3 -m http.server 4590</code> rồi vào <code>http://127.0.0.1:4590/docs/</code>.</p>`;
}

// Markdown khối tối giản: #..####, đoạn, danh sách -/1., ```code```, bảng. Đủ cho docs/shared/*.md.
export function mdToHTML(md) {
  const lines = md.replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n"); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { const n = Math.min(h[1].length + 1, 4); out.push(`<h${n}>${mdInline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*\|/.test(l)) { const buf = []; while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++]); out.push(tableHTML(mdTables(buf.join("\n"))[0])); continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) { const ord = /^\s*\d+\./.test(l); const buf = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) { const m = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)/); if (m) buf.push(m[1]); else buf[buf.length - 1] += " " + lines[i].trim(); i++; }
      out.push(`<${ord ? "ol" : "ul"}>${buf.map((x) => `<li>${mdInline(x)}</li>`).join("")}</${ord ? "ol" : "ul"}>`); continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#|```|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${mdInline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}
// Cắt 1 mục theo tiêu đề (vd "## Phần A") tới tiêu đề cùng hoặc cao cấp hơn.
export function mdSection(md, heading) {
  const lines = md.split("\n"); const start = lines.findIndex((l) => l.trim().startsWith(heading)); if (start < 0) return "";
  const level = (lines[start].match(/^#+/) || ["#"])[0].length; let end = lines.length;
  for (let k = start + 1; k < lines.length; k++) { const m = lines[k].match(/^(#+)\s/); if (m && m[1].length <= level) { end = k; break; } }
  return lines.slice(start, end).join("\n");
}

// ---- b_*: tiện ích cho agent-runtime / dev-workflow / roadmap ----
// Đọc frontmatter YAML tối giản (key: value, key: + "  - item") → object.
export function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/); const o = {}; if (!m) return o; let key = null;
  for (const l of m[1].split("\n")) {
    const li = l.match(/^\s+-\s+(.*)/); if (li && key) { (o[key] = Array.isArray(o[key]) ? o[key] : []).push(li[1].trim()); continue; }
    const kv = l.match(/^([\w-]+):\s*(.*)/); if (kv) { key = kv[1]; o[key] = kv[2].trim(); }
  }
  return o;
}
// Rút gọn mô tả: lấy câu đầu, cắt tối đa n ký tự.
export function shorten(s, n = 150) {
  s = String(s || ""); const first = s.split(/(?<=[.!?])\s/)[0] || s;
  return first.length > n ? first.slice(0, n - 1).trimEnd() + "…" : first;
}

// Trình phát từng bước (sequence động): participants [{id,label,sub}], steps [[phase, from, to, label, kind('ret'|'sec'|''), descHTML]].
// root cần các phần tử con: svg[data-stage], [data-no], [data-phase], [data-title], [data-desc], button[data-prev|data-play|data-next], [data-dots].
export function stepPlayer(root, { participants, steps, interval = 2200 }) {
  const NS = "http://www.w3.org/2000/svg", reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const q = (s) => root.querySelector(s), svg = q("svg[data-stage]");
  const W = 980, gap = W / participants.length, X = {};
  participants.forEach((p, k) => (X[p.id] = gap / 2 + k * gap));
  const el = (n, a = {}, parent) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); parent && parent.appendChild(e); return e; };
  svg.setAttribute("viewBox", `0 0 ${W} ${110 + steps.length * 14 + 20}`);
  const defs = el("defs", {}, svg); const mk = el("marker", { id: "sp-ah", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0 0 L10 5 L0 10 z", fill: "var(--accent)" }, mk);
  const nodes = {}, layer = el("g", {}, svg);
  for (const p of participants) {
    el("line", { x1: X[p.id], x2: X[p.id], y1: 72, y2: 110 + steps.length * 14 + 10, stroke: "var(--border)", "stroke-dasharray": "3 5" }, svg);
    const g = el("g", {}, svg); nodes[p.id] = g;
    el("rect", { x: X[p.id] - Math.min(64, gap / 2 - 6), y: 14, width: Math.min(128, gap - 12), height: 56, rx: 12, fill: "var(--node)", stroke: "var(--node-stroke)", "stroke-width": 1.5 }, g);
    el("text", { x: X[p.id], y: 38, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--text)" }, g).textContent = p.label;
    if (p.sub) el("text", { x: X[p.id], y: 56, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)" }, g).textContent = p.sub;
  }
  svg.appendChild(layer);
  const dotsBox = q("[data-dots]"); let cur = 0, timer = null;
  const dots = steps.map((s, i) => { const b = document.createElement("button"); b.setAttribute("aria-label", `Bước ${i + 1}: ${s[3]}`); b.onclick = () => { stop(); show(i); }; dotsBox && dotsBox.appendChild(b); return b; });
  function arrow(k, faded) {
    const [, f, t, label, kind] = steps[k], y = 110 + k * 14, d = Math.sign(X[t] - X[f]) || 1;
    el("path", { d: `M${X[f] + d * 6} ${y} H${X[t] - d * 8}`, fill: "none", stroke: kind === "sec" ? "var(--danger)" : "var(--accent)", "stroke-width": 2.2, "stroke-dasharray": kind === "ret" ? "6 5" : "", "marker-end": "url(#sp-ah)", opacity: faded ? 0.22 : 1 }, layer);
    return { y, x1: X[f], x2: X[t], label };
  }
  function show(i) {
    cur = (i + steps.length) % steps.length; const [phase, from, to, , , desc] = steps[cur];
    q("[data-no]").textContent = cur + 1; q("[data-phase]").textContent = phase; q("[data-title]").textContent = steps[cur][3]; q("[data-desc]").innerHTML = desc;
    Object.values(nodes).forEach((g) => g.querySelector("rect").setAttribute("stroke", "var(--node-stroke)"));
    [from, to].forEach((id) => nodes[id].querySelector("rect").setAttribute("stroke", "var(--accent)"));
    dots.forEach((d, k) => d.classList.toggle("on", k === cur));
    layer.replaceChildren(); for (let k = 0; k < cur; k++) arrow(k, true);
    const a = arrow(cur, false), mid = (a.x1 + a.x2) / 2, w = Math.min(Math.abs(a.x2 - a.x1) - 16, a.label.length * 6.6 + 14);
    el("rect", { x: mid - w / 2, y: a.y - 22, width: w, height: 17, rx: 5, fill: "var(--surface)" }, layer);
    el("text", { x: mid, y: a.y - 9, "text-anchor": "middle", "font-size": 12, fill: "var(--text)" }, layer).textContent = a.label;
    if (!reduce) el("circle", { r: 6, cx: a.x1, cy: a.y, fill: "var(--accent)" }, layer).animate([{ transform: "translateX(0)" }, { transform: `translateX(${a.x2 - a.x1}px)` }], { duration: 700, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
  }
  function stop() { clearInterval(timer); timer = null; const b = q("[data-play]"); if (b) b.textContent = "▶ Phát"; }
  function play() { if (timer) return stop(); q("[data-play]").textContent = "⏸ Tạm dừng"; if (cur === steps.length - 1) show(0); timer = setInterval(() => (cur === steps.length - 1 ? stop() : show(cur + 1)), interval); }
  q("[data-play]")?.addEventListener("click", play);
  q("[data-prev]")?.addEventListener("click", () => { stop(); show(cur - 1); });
  q("[data-next]")?.addEventListener("click", () => { stop(); show(cur + 1); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select") || !root.getBoundingClientRect().height) return;
    if (e.key === "ArrowRight") { stop(); show(cur + 1); } else if (e.key === "ArrowLeft") { stop(); show(cur - 1); }
  });
  show(0);
  return { show, play, stop };
}

// Nút dừng/chạy cho animation SVG (SMIL) + CSS class .playing; tự dừng khi prefers-reduced-motion.
export function pauseToggle(section, button) {
  const svg = section.querySelector("svg");
  const set = (on) => { section.classList.toggle("playing", on); on ? svg?.unpauseAnimations?.() : svg?.pauseAnimations?.(); button.textContent = on ? "⏸ Dừng animation" : "▶ Chạy animation"; button.setAttribute("aria-pressed", String(on)); };
  button.addEventListener("click", () => set(!section.classList.contains("playing")));
  set(!matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Sơ đồ nhúng (iframe diagrams/*) hay bị trình duyệt giữ cache sau khi sinh lại → thêm tham số phiên bản theo lần mở trang.
export function bustDiagramCache(root = document) {
  const v = Date.now().toString(36);
  root.querySelectorAll('iframe[src^="diagrams/"], a[href^="diagrams/"]').forEach((el) => {
    const attr = el.tagName === "IFRAME" ? "src" : "href";
    const u = el.getAttribute(attr); if (!u || u.includes("?")) return;
    el.setAttribute(attr, `${u}?v=${v}`);
  });
}
