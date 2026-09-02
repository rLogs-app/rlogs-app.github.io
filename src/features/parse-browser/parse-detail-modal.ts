export interface ParseDetailModal {
  show(content: string): void;
  close(): void;
  dispose(): void;
}

export function createParseDetailModal(
  host: HTMLElement,
  onClose: () => void = () => undefined,
): ParseDetailModal {
  const panel = document.createElement("div");
  panel.className = "parse-detail-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Parse details");
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "parse-detail-modal-close";
  closeButton.setAttribute("aria-label", "Close parse details");
  closeButton.textContent = "×";
  const content = document.createElement("div");
  content.className = "parse-detail-modal-content";
  panel.append(closeButton, content);
  host.replaceChildren(panel);
  host.classList.add("parse-detail-modal");
  host.hidden = true;
  let restoreFocus: HTMLElement | null = null;

  const close = (): void => {
    if (host.hidden) return;
    host.hidden = true;
    document.body.classList.remove("parse-modal-open");
    restoreFocus?.focus();
    restoreFocus = null;
    onClose();
  };
  const onBackdrop = (event: MouseEvent): void => {
    if (event.target === host) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !host.hidden) close();
  };
  closeButton.addEventListener("click", close);
  host.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKeyDown);

  return {
    show(html) {
      if (host.hidden) restoreFocus = document.activeElement as HTMLElement | null;
      content.innerHTML = html;
      host.hidden = false;
      document.body.classList.add("parse-modal-open");
      closeButton.focus();
    },
    close,
    dispose() {
      close();
      closeButton.removeEventListener("click", close);
      host.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}
