// src/ui/MuteButton.ts
// Small fixed top-right mute toggle. Pure UI: takes its initial state and a
// callback, never touches localStorage itself (settings persistence is the
// caller's glue, same discipline as settings.ts). Blurs itself after every
// click so it never steals keyboard focus from the game's key handlers.
export class MuteButton {
  private readonly el: HTMLButtonElement;
  private muted: boolean;

  constructor(root: HTMLElement, initialMuted: boolean, onToggle: (muted: boolean) => void) {
    this.muted = initialMuted;
    this.el = document.createElement("button");
    this.el.id = "mutebtn";
    this.el.type = "button";
    this.render();
    this.el.addEventListener("click", () => {
      this.muted = !this.muted;
      this.render();
      onToggle(this.muted);
      this.el.blur();
    });
    root.appendChild(this.el);
  }

  private render(): void {
    this.el.textContent = this.muted ? "🔇" : "🔊";
    this.el.setAttribute("aria-label", this.muted ? "Unmute" : "Mute");
    this.el.setAttribute("aria-pressed", String(this.muted));
  }

  // External sync (Task 11): the settings panel has its own MUTE control
  // over the same underlying setting, so either affordance changing it must
  // update the other's display too. Purely a view update — never calls
  // onToggle, so main.ts (the single source of truth for `settings.muted`)
  // never sees a feedback loop.
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.render();
  }
}
