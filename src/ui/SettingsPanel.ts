// src/ui/SettingsPanel.ts
// Gear-button + modal settings panel (Phase E4 / Task 11). Same discipline
// as MuteButton/NavMap: this component never touches localStorage or
// AudioDirector/Renderer itself — every control change is reported through
// `cb`, and main.ts (the composition root, same place MuteButton/Onboarding
// are wired) is the one place that persists via settings.ts + drives
// game.audio/game.setQualitySetting/game.resetToPad. That keeps exactly one
// source of truth for the persisted Settings object.
import type { Settings, Quality } from "../game/settings";

export interface SettingsPanelCallbacks {
  // Fired on every open()/close() (including Esc and backdrop-click) so the
  // caller can feed Game's shared pause gate (Game.setSettingsOpen).
  onOpenChange(open: boolean): void;
  onMutedChange(muted: boolean): void;
  onMusicChange(musicEnabled: boolean): void;
  onVolumeChange(volume: number): void; // 0..1
  onQualityChange(quality: Quality): void;
  onResetToPad(): void;
  onReplayTutorial(): void;
}

const QUALITY_OPTIONS: readonly Quality[] = ["auto", "high", "low"];
const RESET_CONFIRM_TIMEOUT = 3000; // ms — an armed-but-unconfirmed tap disarms itself

export class SettingsPanel {
  private readonly gearBtn: HTMLButtonElement;
  private readonly el: HTMLDivElement; // full-screen backdrop; click = close
  private readonly closeBtn: HTMLButtonElement;
  private readonly muteToggle: HTMLButtonElement;
  private readonly musicToggle: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly replayBtn: HTMLButtonElement;

  private opened = false;
  private muted: boolean;
  private musicEnabled: boolean;
  private resetArmed = false;
  private resetArmTimer: ReturnType<typeof window.setTimeout> | undefined;

  constructor(
    root: HTMLElement,
    initial: Settings,
    private readonly cb: SettingsPanelCallbacks,
  ) {
    this.muted = initial.muted;
    this.musicEnabled = initial.musicEnabled;

    this.gearBtn = document.createElement("button");
    this.gearBtn.id = "settingsbtn";
    this.gearBtn.type = "button";
    this.gearBtn.textContent = "⚙";
    this.gearBtn.setAttribute("aria-label", "Settings");
    this.gearBtn.addEventListener("click", () => {
      this.toggle();
      this.gearBtn.blur(); // keep keyboard game input alive after the click
    });

    this.el = document.createElement("div");
    this.el.id = "settingspanel";
    // Backdrop click (anywhere that isn't the panel) closes, same idiom as
    // NavMap's backdrop.
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });

    const panel = document.createElement("div");
    panel.className = "panel";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "SETTINGS";

    this.closeBtn = document.createElement("button");
    this.closeBtn.className = "close";
    this.closeBtn.type = "button";
    this.closeBtn.textContent = "×";
    this.closeBtn.setAttribute("aria-label", "Close settings");
    this.closeBtn.addEventListener("click", () => {
      this.close();
      this.closeBtn.blur();
    });

    const paused = document.createElement("div");
    paused.className = "paused";
    paused.textContent = "PAUSED";

    const rows = document.createElement("div");
    rows.className = "rows";

    // MUTE
    const muteRow = this.buildRow("MUTE");
    this.muteToggle = document.createElement("button");
    this.muteToggle.type = "button";
    this.muteToggle.className = "toggle";
    this.renderMute();
    this.muteToggle.addEventListener("click", () => {
      this.muted = !this.muted;
      this.renderMute();
      this.cb.onMutedChange(this.muted);
      this.muteToggle.blur();
    });
    muteRow.appendChild(this.muteToggle);

    // MUSIC
    const musicRow = this.buildRow("MUSIC");
    this.musicToggle = document.createElement("button");
    this.musicToggle.type = "button";
    this.musicToggle.className = "toggle";
    this.renderMusic();
    this.musicToggle.addEventListener("click", () => {
      this.musicEnabled = !this.musicEnabled;
      this.renderMusic();
      this.cb.onMusicChange(this.musicEnabled);
      this.musicToggle.blur();
    });
    musicRow.appendChild(this.musicToggle);

    // SFX VOLUME (live: fires on every drag tick via the "input" event, not
    // just on release)
    const volumeRow = this.buildRow("SFX VOLUME");
    this.volumeSlider = document.createElement("input");
    this.volumeSlider.type = "range";
    this.volumeSlider.className = "volume";
    this.volumeSlider.min = "0";
    this.volumeSlider.max = "100";
    this.volumeSlider.step = "1";
    this.volumeSlider.value = String(Math.round(initial.sfxVolume * 100));
    this.volumeSlider.setAttribute("aria-label", "SFX volume");
    this.volumeSlider.addEventListener("input", () => {
      this.cb.onVolumeChange(Number(this.volumeSlider.value) / 100);
    });
    volumeRow.appendChild(this.volumeSlider);

    // QUALITY
    const qualityRow = this.buildRow("QUALITY");
    this.qualitySelect = document.createElement("select");
    this.qualitySelect.className = "quality";
    this.qualitySelect.setAttribute("aria-label", "Render quality");
    for (const q of QUALITY_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = q;
      opt.textContent = q.toUpperCase();
      this.qualitySelect.appendChild(opt);
    }
    this.qualitySelect.value = initial.quality;
    this.qualitySelect.addEventListener("change", () => {
      this.cb.onQualityChange(this.qualitySelect.value as Quality);
      this.qualitySelect.blur();
    });
    qualityRow.appendChild(this.qualitySelect);

    rows.appendChild(muteRow);
    rows.appendChild(musicRow);
    rows.appendChild(volumeRow);
    rows.appendChild(qualityRow);

    const actions = document.createElement("div");
    actions.className = "actions";

    // RESET TO PAD: two-tap confirm, no browser confirm() dialog. First tap
    // arms it (label flips to "ARE YOU SURE?"); a second tap while armed
    // fires the reset; anything else (blur, timeout, closing the panel)
    // disarms it back to the normal label.
    this.resetBtn = document.createElement("button");
    this.resetBtn.type = "button";
    this.resetBtn.className = "reset";
    this.resetBtn.textContent = "RESET TO PAD";
    this.resetBtn.addEventListener("click", () => {
      if (this.resetArmed) {
        this.disarmReset();
        this.cb.onResetToPad();
      } else {
        this.armReset();
      }
      this.resetBtn.blur();
    });

    this.replayBtn = document.createElement("button");
    this.replayBtn.type = "button";
    this.replayBtn.className = "replay";
    this.replayBtn.textContent = "REPLAY TUTORIAL";
    this.replayBtn.addEventListener("click", () => {
      this.cb.onReplayTutorial();
      this.replayBtn.blur();
    });

    actions.appendChild(this.resetBtn);
    actions.appendChild(this.replayBtn);

    panel.appendChild(title);
    panel.appendChild(this.closeBtn);
    panel.appendChild(paused);
    panel.appendChild(rows);
    panel.appendChild(actions);
    this.el.appendChild(panel);

    root.appendChild(this.gearBtn);
    root.appendChild(this.el);
  }

  private buildRow(label: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "row";
    const span = document.createElement("span");
    span.className = "label";
    span.textContent = label;
    row.appendChild(span);
    return row;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.el.classList.add("open");
    this.cb.onOpenChange(true);
  }

  // Single close path — the × button, the backdrop click, and main.ts's
  // single-owner Esc router all call this, so `opened` (and the
  // onOpenChange notification Game's pause gate depends on) stays
  // single-path no matter what closed it.
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.el.classList.remove("open");
    this.disarmReset();
    this.cb.onOpenChange(false);
  }

  // External sync (Task 11): called by main.ts when the standalone
  // MuteButton toggles, so both mute affordances always agree. Never fires
  // onMutedChange itself — that would loop back into main.ts.
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.renderMute();
  }

  private renderMute(): void {
    this.muteToggle.textContent = this.muted ? "MUTED" : "ON";
    this.muteToggle.classList.toggle("off", this.muted);
    this.muteToggle.setAttribute("aria-pressed", String(this.muted));
  }

  private renderMusic(): void {
    this.musicToggle.textContent = this.musicEnabled ? "ON" : "OFF";
    this.musicToggle.classList.toggle("off", !this.musicEnabled);
    this.musicToggle.setAttribute("aria-pressed", String(this.musicEnabled));
  }

  private armReset(): void {
    this.resetArmed = true;
    this.resetBtn.textContent = "ARE YOU SURE?";
    this.resetBtn.classList.add("armed");
    if (this.resetArmTimer !== undefined) window.clearTimeout(this.resetArmTimer);
    this.resetArmTimer = window.setTimeout(() => this.disarmReset(), RESET_CONFIRM_TIMEOUT);
  }

  private disarmReset(): void {
    if (this.resetArmTimer !== undefined) {
      window.clearTimeout(this.resetArmTimer);
      this.resetArmTimer = undefined;
    }
    if (!this.resetArmed) return;
    this.resetArmed = false;
    this.resetBtn.textContent = "RESET TO PAD";
    this.resetBtn.classList.remove("armed");
  }
}
