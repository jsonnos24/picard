import { DEFAULT_BINDINGS } from "../sim/input/bindings";

// First-run overlay: shown once (settings.onboarded === false) after the
// splash fades, to orient a new player before they touch anything. Pointer-
// type aware (coarse gets a two-zone drag/tap diagram, fine gets key chips).
//
// Never blocks input: the overlay itself is pointer-events:none (only its
// GOT IT button is interactive), and the window-level dismiss listeners
// never call preventDefault/stopPropagation on game input, so the real
// InputManager keydown listener (attached separately in Game.ts) still sees
// every key. A synthetic KeyboardEvent from the headless verify harness
// dismisses it exactly like a real keypress would.
export class Onboarding {
  private readonly el: HTMLDivElement;
  private shown = false;
  private dismissed = false;

  constructor(
    root: HTMLElement,
    private readonly onDismiss: () => void,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.el = document.createElement("div");
    this.el.id = "onboarding";
    this.el.classList.add("hidden");
    this.el.innerHTML = coarse ? this.coarseMarkup() : this.fineMarkup();
    root.appendChild(this.el);

    const gotIt = this.el.querySelector<HTMLButtonElement>(".onb-gotit");
    gotIt?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.dismiss();
    });

    // Capture phase so this reliably sees the event even if some other
    // handler stops propagation later — it never itself stops propagation,
    // so nothing downstream (the game's own listeners) is affected.
    window.addEventListener("keydown", this.handleKey, true);
    window.addEventListener("pointerdown", this.handlePointer, true);
  }

  // Called by main.ts once the splash has fully faded (or a fallback delay
  // with no splash present). No-ops if already dismissed (already-onboarded
  // players never see this at all — main.ts only calls reveal() when
  // settings.onboarded is false).
  reveal(): void {
    if (this.dismissed) return;
    this.shown = true;
    this.el.classList.remove("hidden");
  }

  private handleKey = (e: KeyboardEvent): void => {
    if (!this.shown || this.dismissed) return;
    if (e.code in DEFAULT_BINDINGS) this.dismiss();
  };

  private handlePointer = (e: PointerEvent): void => {
    if (!this.shown || this.dismissed) return;
    const target = e.target;
    if (target instanceof Element && target.closest(".steerzone, #touchcontrols .tbtn")) {
      this.dismiss();
    }
  };

  private dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    this.el.classList.add("hidden");
    window.removeEventListener("keydown", this.handleKey, true);
    window.removeEventListener("pointerdown", this.handlePointer, true);
    this.onDismiss();
  }

  // REPLAY TUTORIAL (Task 11, settings panel): re-arms the overlay exactly
  // as if it had never been dismissed — clears `dismissed`, reinstalls the
  // same dismiss listeners removed above, and reveals. onDismiss fires again
  // on the next dismissal, which is fine: main.ts's handler just persists
  // onboarded=true again, a no-op if it's already true.
  replay(): void {
    this.dismissed = false;
    window.addEventListener("keydown", this.handleKey, true);
    window.addEventListener("pointerdown", this.handlePointer, true);
    this.reveal();
  }

  private coarseMarkup(): string {
    return (
      `<div class="onb-panel onb-left"><div class="onb-ring"></div>` +
      `<p class="onb-label">DRAG TO STEER</p></div>` +
      `<div class="onb-panel onb-right"><p class="onb-label">ACTIONS</p>` +
      `<p class="onb-sub">THIS BUTTON DOES<br/>THE NEXT RIGHT THING</p></div>` +
      `<button type="button" class="onb-gotit">GOT IT</button>`
    );
  }

  private fineMarkup(): string {
    const chips: [string, string][] = [
      ["W", "THRUST"],
      ["J", "LIGHTSPEED"],
      ["SPACE", "SWING/LAUNCH"],
      ["L", "LAND"],
      ["M", "MAP"],
    ];
    const chipHtml = chips
      .map(([key, label]) => `<span class="onb-chip"><b>${key}</b>${label}</span>`)
      .join("");
    return (
      `<div class="onb-panel onb-fine"><div class="onb-chips">${chipHtml}</div></div>` +
      `<button type="button" class="onb-gotit">GOT IT</button>`
    );
  }
}
