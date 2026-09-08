import { searchGuide } from "./guide-utils.mjs";
const dialog = document.querySelector(".guide-search-dialog");
const input = document.querySelector("#guide-search-input");
const status = document.querySelector(".guide-search-status");
const results = document.querySelector(".guide-search-results");
const retry = document.querySelector("[data-search-retry]");
let entriesPromise, searchSequence = 0, returnFocus;
async function getEntries() {
  entriesPromise ??= fetch(new URL("./search-index.json", import.meta.url)).then((response) => {
    if (!response.ok) throw new Error("Search index unavailable");
    return response.json();
  }).then((data) => {
    if (!Array.isArray(data)) throw new Error("Invalid search index");
    return data;
  }).catch((error) => { entriesPromise = undefined; throw error; });
  return entriesPromise;
}
async function updateSearch() {
  const sequence = ++searchSequence;
  const query = input.value.trim();
  retry.hidden = true;
  results.replaceChildren();
  if (!query) { status.textContent = "本文も含めて検索します。例：ラフネス、色 変わらない、保存。検索語は外部へ送信しません。"; return; }
  status.textContent = "検索を読み込んでいます…";
  try {
    const entries = await getEntries();
    if (sequence !== searchSequence) return;
    const hits = searchGuide(entries, query);
    status.textContent = hits.length ? `${hits.length}件を表示しています。結果を選ぶと該当する説明を開きます。` : "見つかりませんでした。短い言葉や画面の項目名で検索するか、目次から探してください。";
    for (const hit of hits) {
      const li = document.createElement("li"), link = document.createElement("a"), title = document.createElement("strong");
      // URLs come only from a versioned, same-origin build artifact.
      if (!/^\.\/[a-z0-9-]+\.html(?:#[^\s]*)?$/.test(hit.url)) continue;
      link.href = hit.url;
      title.textContent = hit.heading || hit.title;
      link.append(title);
      if (hit.heading) { const page = document.createElement("small"); page.textContent = hit.title; link.append(page); }
      const text = document.createElement("p"); text.textContent = hit.snippet; link.append(text);
      li.append(link); results.append(li);
    }
  } catch {
    if (sequence !== searchSequence) return;
    status.textContent = "検索用データを読み込めませんでした。接続を確認してやり直すか、目次から探してください。本文は引き続き読めます。";
    retry.hidden = false;
  }
}
for (const trigger of document.querySelectorAll("[data-open-search]")) {
  trigger.hidden = false;
  trigger.addEventListener("click", () => {
    returnFocus = trigger;
    const mobile = document.querySelector("[data-mobile-nav]"); if (mobile) mobile.open = false;
    dialog.showModal(); input.focus(); updateSearch();
  });
}
dialog?.querySelector("[data-close-search]")?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("close", () => { searchSequence++; returnFocus?.focus(); });
dialog?.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
let debounce;
input?.addEventListener("input", () => { clearTimeout(debounce); searchSequence++; results.replaceChildren(); debounce = setTimeout(updateSearch, 100); });
input?.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  // A search input consumes the first Escape to clear its text in Chromium.
  // Close explicitly so one Escape always leaves the dialog.
  if (event.key === "Escape") { event.preventDefault(); dialog.close(); return; }
  if (event.key === "ArrowDown") { event.preventDefault(); results.querySelector("a")?.focus(); }
  if (event.key === "Enter") { event.preventDefault(); clearTimeout(debounce); updateSearch(); }
});
retry?.addEventListener("click", updateSearch);
const mobileNav = document.querySelector("[data-mobile-nav]");
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileNav?.open && !dialog.open) { mobileNav.open = false; mobileNav.querySelector("summary")?.focus(); }
});
document.addEventListener("pointerdown", (event) => {
  if (mobileNav?.open && !mobileNav.contains(event.target)) mobileNav.open = false;
});
