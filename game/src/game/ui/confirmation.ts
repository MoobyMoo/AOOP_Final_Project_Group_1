import { G } from "../core/state";
type Request = { title: string; message: string; reasons: string[]; confirmLabel: string; valid: () => boolean; run: () => void };
let overlay: HTMLDivElement | null = null, previous: HTMLElement | null = null;
export const confirmationOpen = () => !!overlay;
function close() {
  overlay?.remove(); overlay = null; removeEventListener("keydown", onKey, true); G.input?.pressed.clear();
  accept = () => {};
  if (previous?.isConnected) previous.focus({ preventScroll: true }); previous = null;
}
let accept = () => {};
function onKey(e: KeyboardEvent) {
  if (!overlay) return; e.stopImmediatePropagation();
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "Tab") { e.preventDefault(); const buttons = [...overlay.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if ((document.activeElement as HTMLElement)?.dataset.confirm === "yes") accept(); else close(); }
}
export function confirmAction(request: Request) {
  if (overlay) return;
  previous = document.activeElement as HTMLElement | null; G.input?.pressed.clear();
  overlay = document.createElement("div"); overlay.className = "confirm-action-layer";
  overlay.innerHTML = `<section class="confirm-action" role="alertdialog" aria-modal="true" aria-labelledby="action-title" aria-describedby="action-message"><h2 id="action-title"></h2><p id="action-message"></p><ul></ul><p class="confirm-error" role="status"></p><div><button type="button" data-confirm="no">Cancel</button><button type="button" data-confirm="yes"></button></div></section>`;
  overlay.querySelector("h2")!.textContent = request.title;
  overlay.querySelector("#action-message")!.textContent = request.message;
  const list = overlay.querySelector("ul")!;
  for (const reason of request.reasons) { const li = document.createElement("li"); li.textContent = reason; list.appendChild(li); }
  const yes = overlay.querySelector<HTMLButtonElement>('[data-confirm="yes"]')!;
  yes.textContent = request.confirmLabel;
  const current = overlay;
  accept = () => {
    if (overlay !== current) return;
    if (!request.valid()) { current.querySelector(".confirm-error")!.textContent = "Inventory changed. Cancel and try again."; return; }
    close();
    request.run();
  };
  yes.onclick = accept; overlay.querySelector<HTMLButtonElement>('[data-confirm="no"]')!.onclick = close;
  document.body.appendChild(overlay); addEventListener("keydown", onKey, true);
  overlay.querySelector<HTMLButtonElement>('[data-confirm="no"]')!.focus();
}
