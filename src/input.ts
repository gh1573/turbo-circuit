export class Input {
  private keys = new Set<string>();
  private touchState = { left: false, right: false, gas: false, brake: false, handbrake: false, nitro: false };

  private _reset = false;
  private _mute = false;
  private _pause = false;
  private _start = false;

  readonly isTouch: boolean;

  constructor() {
    this.isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyR") this._reset = true;
      if (e.code === "KeyM") this._mute = true;
      if (e.code === "Escape" || e.code === "KeyP") this._pause = true;
      if (e.code === "Enter") this._start = true;
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.touchState = { left: false, right: false, gas: false, brake: false, handbrake: false, nitro: false };
    });
  }

  private isGameKey(code: string): boolean {
    return (
      code.startsWith("Arrow") ||
      code === "Space" ||
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD"
    );
  }

  get throttle(): number {
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.touchState.gas) return 1;
    return 0;
  }

  get brake(): number {
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS") || this.touchState.brake) return 1;
    return 0;
  }

  get steer(): number {
    let s = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchState.left) s -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchState.right) s += 1;
    return s;
  }

  get handbrake(): boolean {
    return this.keys.has("Space") || this.touchState.handbrake;
  }

  get nitro(): boolean {
    return (
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      this.touchState.nitro
    );
  }

  consumeReset(): boolean {
    const v = this._reset;
    this._reset = false;
    return v;
  }

  consumeMute(): boolean {
    const v = this._mute;
    this._mute = false;
    return v;
  }

  consumePause(): boolean {
    const v = this._pause;
    this._pause = false;
    return v;
  }

  consumeStart(): boolean {
    const v = this._start;
    this._start = false;
    return v;
  }

  /** 绑定触屏按钮 */
  bindTouch(): void {
    const bind = (id: string, key: keyof typeof this.touchState) => {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (!el) return;
      const on = (e: PointerEvent) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // 指针已失效时忽略，仍记录按下状态
        }
        this.touchState[key] = true;
      };
      const off = (e: PointerEvent) => {
        e.preventDefault();
        this.touchState[key] = false;
      };
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointercancel", off);
      el.addEventListener("lostpointercapture", off);
    };
    bind("btn-left", "left");
    bind("btn-right", "right");
    bind("btn-gas", "gas");
    bind("btn-brake", "brake");
    bind("btn-drift", "handbrake");
    bind("btn-nitro", "nitro");
  }
}
