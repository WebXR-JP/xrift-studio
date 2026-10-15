/** Copy the rendered output, including collapsed Plan/log text and action labels.
 * Expand a temporary clone so the author's open/closed panels stay unchanged. */
export function chatgptOutputText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("details").forEach(details => { details.open = true; });
  clone.querySelectorAll("[data-chatgpt-copy-skip]").forEach(element => element.remove());
  clone.querySelectorAll<HTMLElement>("[data-chatgpt-copy-hidden]").forEach(element => { element.hidden = false; });
  clone.removeAttribute("aria-label");
  clone.setAttribute("aria-hidden", "true");
  clone.style.cssText = `position:fixed;left:-100000px;top:0;width:${element.clientWidth}px;pointer-events:none;user-select:text`;
  element.ownerDocument.body.append(clone);
  try { return clone.innerText.trim(); }
  finally { clone.remove(); }
}
