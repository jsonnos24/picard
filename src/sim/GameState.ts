export type Phase =
  | "LandedEarth"
  | "Launching"
  | "InSpace"
  | "Descending"
  | "LandedMoon"
  | "OnFoot";

const ALLOWED: Record<Phase, Phase[]> = {
  LandedEarth: ["Launching"],
  Launching: ["InSpace"],
  InSpace: ["Descending"],
  Descending: ["LandedMoon", "InSpace"],
  LandedMoon: ["OnFoot", "Launching"],
  OnFoot: ["LandedMoon"],
};

export function initialPhase(): Phase {
  return "LandedEarth";
}

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} -> ${to}`);
  }
  return to;
}
