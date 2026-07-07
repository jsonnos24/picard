import { ContextVerb } from "../game/contextAction";
import { keyForIntent } from "./format";

// Desktop mirror of the touch layer's big context button: a small pill
// showing the current verb and its key, e.g. "J — LIGHTSPEED". Hidden on
// coarse pointers via CSS (the touch button already covers that case).
// textContent only mutates on change, with a brief pulse re-triggered the
// same way HUD's marker pop does (remove/reflow/add the class).
export class ContextChip {
  private readonly el: HTMLDivElement;
  private readonly textEl: HTMLSpanElement;
  private lastText = "";

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "contextchip";
    this.el.classList.add("hidden");
    this.textEl = document.createElement("span");
    this.el.appendChild(this.textEl);
    root.appendChild(this.el);
  }

  update(verb: ContextVerb): void {
    if (!verb.label) {
      if (!this.el.classList.contains("hidden")) this.el.classList.add("hidden");
      return;
    }
    const text = verb.intent ? `${keyForIntent(verb.intent)} — ${verb.label}` : verb.label;
    if (text !== this.lastText) {
      this.lastText = text;
      this.textEl.textContent = text;
      this.el.classList.remove("pulse");
      void this.el.offsetWidth; // force reflow so the animation restarts
      this.el.classList.add("pulse");
    }
    if (this.el.classList.contains("hidden")) this.el.classList.remove("hidden");
  }
}
