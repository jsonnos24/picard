import { InputManager } from "../sim/input/InputManager";
import { Intent } from "../sim/input/bindings";
import { ContextVerb } from "../game/contextAction";
import { stickVector } from "../game/feel/stick";

// One-thumb touch layer: the left ~60% of the screen is an anchored drag-stick
// feeding the analog steer axes; a right-side cluster carries the big
// context-verb button plus MAP / CAM / JUMP / EXIT. Everything routes through
// the same InputManager the keyboard uses. Hidden entirely on fine-pointer
// (mouse) machines via CSS.

const DRAG_FULL_DEFLECTION_PX = 80;
const STICK_DEAD_ZONE_PX = 8;
const STICK_BASE_PX = 88;
const STICK_NUB_PX = 40;
// The visual nub is clamped inside the base ring (a smaller radius than the
// 80px the finger can actually travel for full deflection) — standard
// thumbstick convention: the graphic stays tidy while the gesture range
// stays generous.
const STICK_VISUAL_RADIUS_PX = (STICK_BASE_PX - STICK_NUB_PX) / 2;

export class TouchControls {
  private readonly el: HTMLDivElement;
  private readonly contextBtn: HTMLButtonElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly exitBtn: HTMLButtonElement;
  private readonly brakeBtn: HTMLButtonElement;
  private readonly warpBtn: HTMLButtonElement;
  private readonly stickIdle: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickNub: HTMLDivElement;
  private contextIntent: Intent | null = null;
  private contextDown = false;
  private steerPointer: number | null = null;
  private anchorX = 0;
  private anchorY = 0;
  private onboarded = false; // set by Game.setOnboarded once settings load
  private hasSteeredThisSession = false;

  constructor(
    root: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.el = document.createElement("div");
    this.el.id = "touchcontrols";

    const steer = document.createElement("div");
    steer.className = "steerzone";
    this.el.appendChild(steer);

    // Idle affordance shown at a fixed resting spot until the player's first
    // steer touch this session (and only pre-onboarding — see setOnboarded).
    this.stickIdle = document.createElement("div");
    this.stickIdle.className = "stickidle";
    steer.appendChild(this.stickIdle);

    // Base ring + nub: hidden until a steer pointer is down, then pinned to
    // the touch-down anchor for the life of that drag.
    this.stickBase = document.createElement("div");
    this.stickBase.className = "stickbase";
    steer.appendChild(this.stickBase);
    this.stickNub = document.createElement("div");
    this.stickNub.className = "sticknub";
    steer.appendChild(this.stickNub);

    const cluster = document.createElement("div");
    cluster.className = "cluster";
    this.contextBtn = this.makeButton(cluster, "context", "");
    this.jumpBtn = this.makeTapButton(cluster, "JUMP", "jump");
    this.exitBtn = this.makeTapButton(cluster, "EXIT", "toggleExit");
    this.brakeBtn = this.makeTapButton(cluster, "BRAKE", "throttleDown");
    this.warpBtn = this.makeTapButton(cluster, "WARP", "lightspeed");
    this.makeTapButton(cluster, "MAP", "openMap");
    this.makeTapButton(cluster, "CAM", "toggleCamera");
    this.el.appendChild(cluster);
    root.appendChild(this.el);

    // Anchored drag steering: deflection from the touch-down point, not
    // absolute. stickVector() supplies the 8px dead-zone + smooth rescale to
    // 80px full deflection, clamped to a unit vector beyond that.
    steer.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.steerPointer = e.pointerId;
      this.anchorX = e.clientX;
      this.anchorY = e.clientY;
      // Best-effort: capture keeps pointermove/up routed here even if the
      // finger drifts outside the (full-screen) steer zone. It can throw if
      // the pointerId isn't one the browser considers active (observed with
      // synthetic PointerEvents in automated testing) — steering and the
      // visual feedback below must not depend on it succeeding.
      try {
        steer.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal — see comment above */
      }

      this.stickBase.style.left = `${this.anchorX}px`;
      this.stickBase.style.top = `${this.anchorY}px`;
      this.stickNub.style.left = `${this.anchorX}px`;
      this.stickNub.style.top = `${this.anchorY}px`;
      this.stickNub.style.transform = "translate(0px, 0px)";
      this.stickBase.classList.add("show");
      this.stickNub.classList.add("show");

      if (!this.hasSteeredThisSession) {
        this.hasSteeredThisSession = true;
        this.updateIdleHint();
      }
    });
    steer.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.steerPointer) return;
      const v = stickVector(
        this.anchorX,
        this.anchorY,
        e.clientX,
        e.clientY,
        DRAG_FULL_DEFLECTION_PX,
        STICK_DEAD_ZONE_PX,
      );
      this.input.setAxis("steerX", v.x);
      this.input.setAxis("steerY", -v.y); // drag up = nose up
      this.stickNub.style.transform = `translate(${v.x * STICK_VISUAL_RADIUS_PX}px, ${
        v.y * STICK_VISUAL_RADIUS_PX
      }px)`;
    });
    const endSteer = (e: PointerEvent): void => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.input.clearAxis("steerX");
      this.input.clearAxis("steerY");
      this.stickBase.classList.remove("show");
      this.stickNub.classList.remove("show");
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

    // Sane default before Game.setOnboarded arrives (main.ts calls it once
    // settings load, same lifecycle as setQualitySetting) — assume a fresh
    // player so the idle ring shows rather than flashing in a frame late.
    this.updateIdleHint();
  }

  // Called by Game once persisted Settings have loaded. Only affects the
  // idle hint ring — a returning (already-onboarded) player never sees it,
  // even before their first steer touch this session.
  setOnboarded(onboarded: boolean): void {
    this.onboarded = onboarded;
    this.updateIdleHint();
  }

  private updateIdleHint(): void {
    const show = !this.onboarded && !this.hasSteeredThisSession;
    this.stickIdle.classList.toggle("hidden", !show);
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
    // Point-and-fly: lightspeed no longer needs a target, so WARP is always
    // one tap away whenever the ship can jump at all.
    this.warpBtn.style.display = flying || landed ? "" : "none";
  }
}
