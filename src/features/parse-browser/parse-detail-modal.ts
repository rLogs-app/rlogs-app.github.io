export interface ParseDetailModal {
  show(content: string): void;
  close(): void;
  dispose(): void;
}

export interface ParseDetailModalOptions {
  ariaLabel?: string;
  closeAriaLabel?: string;
  bodyClass?: string;
  hostClass?: string;
  panelClass?: string;
}

const visibleModalHosts: HTMLElement[] = [];

export function createParseDetailModal(
  host: HTMLElement,
  onClose: () => void = () => undefined,
  options: ParseDetailModalOptions = {},
): ParseDetailModal {
  const bodyClass = options.bodyClass ?? "parse-modal-open";
  const panel = document.createElement("div");
  panel.className = ["parse-detail-modal-panel", options.panelClass].filter(Boolean).join(" ");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", options.ariaLabel ?? "Parse details");
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "parse-detail-modal-close";
  closeButton.setAttribute("aria-label", options.closeAriaLabel ?? "Close parse details");
  closeButton.textContent = "×";
  const content = document.createElement("div");
  content.className = "parse-detail-modal-content";
  panel.append(closeButton, content);
  host.replaceChildren(panel);
  host.classList.add("parse-detail-modal");
  if (options.hostClass) host.classList.add(options.hostClass);
  host.hidden = true;
  let restoreFocus: HTMLElement | null = null;

  const close = (): void => {
    if (host.hidden) return;
    host.hidden = true;
    const stackIndex = visibleModalHosts.lastIndexOf(host);
    if (stackIndex >= 0) visibleModalHosts.splice(stackIndex, 1);
    document.body.classList.remove(bodyClass);
    onClose();
    restoreFocus?.focus();
    restoreFocus = null;
  };
  const onBackdrop = (event: MouseEvent): void => {
    if (event.target === host && visibleModalHosts.at(-1) === host) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && visibleModalHosts.at(-1) === host) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  };
  closeButton.addEventListener("click", close);
  host.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKeyDown);

  return {
    show(html) {
      if (host.hidden) {
        restoreFocus = document.activeElement as HTMLElement | null;
        visibleModalHosts.push(host);
      }
      content.innerHTML = html;
      host.hidden = false;
      document.body.classList.add(bodyClass);
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
