import { describe, it, expect } from "vitest";
import {
  formatDistanceKm,
  formatEta,
  formatGravity,
  bodyInfoLines,
  keyForIntent,
} from "../../src/ui/format";
import { createSolarSystem, findBody, surfaceGravity } from "../../src/sim/Body";

describe("formatDistanceKm", () => {
  it("shows 0 m at zero distance", () => {
    expect(formatDistanceKm(0)).toBe("0 m");
  });
  it("shows meters under 1 km", () => {
    expect(formatDistanceKm(850)).toBe("850 m");
  });
  it("switches to km at 1000 m", () => {
    expect(formatDistanceKm(1000)).toBe("1 km");
  });
  it("rounds and comma-groups large km values", () => {
    expect(formatDistanceKm(1_234_500)).toBe("1,235 km");
  });
  it("handles huge distances", () => {
    expect(formatDistanceKm(4_000_000_000)).toBe("4,000,000 km");
  });
});

describe("formatEta", () => {
  it("shows ~0 s at zero", () => {
    expect(formatEta(0)).toBe("~0 s");
  });
  it("rounds sub-second values to ~0 s", () => {
    expect(formatEta(0.4)).toBe("~0 s");
  });
  it("shows approximate seconds under a minute", () => {
    expect(formatEta(32.4)).toBe("~32 s");
  });
  it("shows minutes and seconds at/above a minute", () => {
    expect(formatEta(72)).toBe("1 m 12 s");
  });
  it("shows hours and minutes for huge values", () => {
    expect(formatEta(3600)).toBe("1 h 0 m");
  });
});

describe("formatGravity", () => {
  it("shows 0.0 g at zero", () => {
    expect(formatGravity(0)).toBe("0.0 g");
  });
  it("shows 1.0 g at Earth surface gravity", () => {
    expect(formatGravity(10)).toBe("1.0 g");
  });
  it("shows fractional g for lighter bodies", () => {
    expect(formatGravity(4)).toBe("0.4 g");
  });
  it("shows multi-g for heavy bodies", () => {
    expect(formatGravity(40)).toBe("4.0 g");
  });
});

describe("bodyInfoLines", () => {
  const bodies = createSolarSystem();
  const earth = findBody(bodies, "Earth");
  const moon = findBody(bodies, "Moon");

  it("includes name, kind, distance, eta, gravity, landable for a planet", () => {
    const lines = bodyInfoLines(earth, 1_234_500, 32.4);
    expect(lines).toContain("Earth");
    expect(lines).toContain("planet");
    expect(lines).toContain("1,235 km");
    expect(lines).toContain("ETA ~32 s");
    expect(lines).toContain(formatGravity(surfaceGravity(earth)));
    expect(lines).toContain("Landable");
  });

  it("reflects a moon's kind and gravity", () => {
    const lines = bodyInfoLines(moon, 50_000, 8);
    expect(lines).toContain("Moon");
    expect(lines).toContain("moon");
    expect(lines).toContain(formatGravity(surfaceGravity(moon)));
  });
});

describe("keyForIntent", () => {
  it("strips the Key prefix for letter keys", () => {
    expect(keyForIntent("lightspeed")).toBe("J");
    expect(keyForIntent("landingAssist")).toBe("L");
    expect(keyForIntent("toggleExit")).toBe("F");
    expect(keyForIntent("throttleUp")).toBe("W");
  });
  it("renders Space as SPACE", () => {
    expect(keyForIntent("slingHold")).toBe("SPACE");
    expect(keyForIntent("jump")).toBe("SPACE");
  });
  it("renders arrow keys without the Arrow prefix", () => {
    expect(keyForIntent("pitchUp")).toBe("UP");
    expect(keyForIntent("pitchDown")).toBe("DOWN");
  });
  it("covers every bound intent without falling back", () => {
    const intents: Parameters<typeof keyForIntent>[0][] = [
      "throttleUp",
      "throttleDown",
      "pitchUp",
      "pitchDown",
      "yawLeft",
      "yawRight",
      "rollLeft",
      "rollRight",
      "slingHold",
      "openMap",
      "lightspeed",
      "toggleExit",
      "toggleCamera",
      "walkForward",
      "walkBack",
      "walkLeft",
      "walkRight",
      "jump",
      "landingAssist",
    ];
    for (const intent of intents) {
      expect(keyForIntent(intent)).not.toBe("?");
    }
  });
});
