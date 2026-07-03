export type Phase =
  | { kind: "landed"; body: string }
  | { kind: "launching"; body: string }
  | { kind: "space" }
  | { kind: "descending"; body: string }
  | { kind: "onFoot"; body: string };

export type PhaseKind = Phase["kind"];

const ALLOWED: Record<PhaseKind, PhaseKind[]> = {
  landed: ["launching", "onFoot"],
  launching: ["space"],
  space: ["descending"],
  descending: ["landed", "space"],
  onFoot: ["landed"],
};

export function initialPhase(): Phase {
  return { kind: "landed", body: "Earth" };
}

export function samePhase(a: Phase, b: Phase): boolean {
  if (a.kind !== b.kind) return false;
  const bodyA = "body" in a ? a.body : null;
  const bodyB = "body" in b ? b.body : null;
  return bodyA === bodyB;
}

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from.kind].includes(to.kind);
}

export function transition(from: Phase, to: Phase): Phase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${phaseLabel(from)} -> ${phaseLabel(to)}`);
  }
  return to;
}

const KIND_LABELS: Record<PhaseKind, string> = {
  landed: "LANDED",
  launching: "LAUNCHING",
  space: "IN SPACE",
  descending: "DESCENDING",
  onFoot: "ON FOOT",
};

export function phaseLabel(p: Phase): string {
  const where = "body" in p ? ` · ${p.body.toUpperCase()}` : "";
  return KIND_LABELS[p.kind] + where;
}
