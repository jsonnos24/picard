import { InputManager } from "../sim/input/InputManager";
import { Intent } from "../sim/input/bindings";
import { ContextVerb } from "../game/contextAction";

// One-thumb touch layer: the left ~60% of the screen is an anchored drag-stick
// feeding the analog steer axes; a right-side cluster carries the big
// context-verb button plus MAP / CAM / JUMP / EXIT. Everything routes through
// the same InputManager the keyboard uses. Hidden entirely on fine-pointer
// (mouse) machines via CSS.

const DRAG_FULL_DEFLECTION_PX = 80;

export class TouchControls {
  private readonly el: HTMLDivElement;
  private readonly contextBtn: HTMLButtonElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly exitBtn: HTMLButtonElement;
  private readonly brakeBtn: HTMLButtonElement;
  private contextIntent: Intent | null = null;
  private contextDown = false;
  private steerPointer: number | null = null;
  private anchorX = 0;
  private anchorY = 0;

  constructor(
    root: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.el = document.createElement("div");
    this.el.id = "touchcontrols";

    const steer = document.createElement("div");
    steer.className = "steerzone";
    this.el.appendChild(steer);

    const cluster = document.createElement("div");
    cluster.className = "cluster";
    this.contextBtn = this.makeButton(cluster, "context", "");
    this.jumpBtn = this.makeTapButton(cluster, "JUMP", "jump");
    this.exitBtn = this.makeTapButton(cluster, "EXIT", "toggleExit");
    this.brakeBtn = this.makeTapButton(cluster, "BRAKE", "throttleDown");
    this.makeTapButton(cluster, "MAP", "openMap");
    this.makeTapButton(cluster, "CAM", "toggleCamera");
    this.el.appendChild(cluster);
    root.appendChild(this.el);

    // Anchored drag steering: deflection from the touch-down point, not absolute.
    steer.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.steerPointer = e.pointerId;
      this.anchorX = e.clientX;
      this.anchorY = e.clientY;
      steer.setPointerCapture(e.pointerId);
    });
    steer.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.steerPointer) return;
      const dx = (e.clientX - this.anchorX) / DRAG_FULL_DEFLECTION_PX;
      const dy = (e.clientY - this.anchorY) / DRAG_FULL_DEFLECTION_PX;
      this.input.setAxis("steerX", dx);
      this.input.setAxis("steerY", -dy); // drag up = nose up
    });
    const endSteer = (e: PointerEvent): void => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.input.clearAxis("steerX");
      this.input.clearAxis("steerY");
    };
    steer.addEventListener("pointerup", endSteer);
    steer.addEventListener("pointercancel", endSteer);

    // The context button: press/hold semantics, verb set per-frame by the game.
    this.contextBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!this.contextIntent) return;
      this.contextDown = true;
      this.input.injectIntent(this.contextIntent, true);
    });
    const endContext = (): void => {
      if (this.contextDown && this.contextIntent) {
        this.input.injectIntent(this.contextIntent, false);
      }
      this.contextDown = false;
    };
    this.contextBtn.addEventListener("pointerup", endContext);
    this.contextBtn.addEventListener("pointercancel", endContext);
  }

  private makeButton(parent: HTMLElement, className: string, label: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = `tbtn ${className}`;
    btn.textContent = label;
    parent.appendChild(btn);
    return btn;
  }

  // Simple tap buttons: intent down on press, up on release.
  private makeTapButton(parent: HTMLElement, label: string, intent: Intent): HTMLButtonElement {
    const btn = this.makeButton(parent, label.toLowerCase(), label);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.input.injectIntent(intent, true);
    });
    const up = (): void => this.input.injectIntent(intent, false);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    return btn;
  }

  // Called each frame: keep the verb current, but never swap the intent out
  // from under an active press.
  update(verb: ContextVerb, onFoot: boolean, landed: boolean, flying: boolean): void {
    if (!this.contextDown) this.contextIntent = verb.intent;
    if (this.contextBtn.textContent !== verb.label) this.contextBtn.textContent = verb.label;
    this.contextBtn.classList.toggle("disabled", verb.intent === null);
    this.jumpBtn.style.display = onFoot ? "" : "none";
    this.exitBtn.style.display = landed ? "" : "none";
    this.brakeBtn.style.display = flying ? "" : "none";
  }
}
