import type { ActionDefinition, ActionId } from "./types.ts";

export const ACTIONS: Readonly<Record<ActionId, ActionDefinition>> = {
  stone: {
    id: "stone",
    label: "石头",
    kind: "resource",
    energyCost: 0,
    level: 0,
  },
  kill: {
    id: "kill",
    label: "杀",
    kind: "attack",
    energyCost: 1,
    level: 1,
  },
  "flying-kill": {
    id: "flying-kill",
    label: "飞杀",
    kind: "attack",
    energyCost: 2,
    level: 2,
  },
  "super-kill": {
    id: "super-kill",
    label: "超杀",
    kind: "attack",
    energyCost: 3,
    level: 3,
  },
  guard: {
    id: "guard",
    label: "防",
    kind: "defense",
    energyCost: 0,
    level: 1,
  },
  "low-guard": {
    id: "low-guard",
    label: "下防",
    kind: "defense",
    energyCost: 0,
    level: 2,
  },
  "high-guard": {
    id: "high-guard",
    label: "上防",
    kind: "defense",
    energyCost: 0,
    level: 3,
  },
};

