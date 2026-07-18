export const SKILL_ICON_KEYS = [
  "stone",
  "kill",
  "flying-kill",
  "super-kill",
  "guard",
  "high-guard",
  "low-guard",
] as const;

export const SKILL_ICON_STATES = [
  "default",
  "pressed",
  "cooldown",
  "insufficient",
] as const;

export type SkillIconKey = (typeof SKILL_ICON_KEYS)[number];
export type SkillIconState = (typeof SKILL_ICON_STATES)[number];

const SKILL_ICON_VERSION = "20260718";

function iconUrl(name: string): string {
  return `/icons/${name}.png?v=${SKILL_ICON_VERSION}`;
}

export const skillIcons: Readonly<
  Record<SkillIconKey, Readonly<Record<SkillIconState, string>>>
> = Object.fromEntries(
  SKILL_ICON_KEYS.map((key) => [
    key,
    {
      default: iconUrl(key),
      pressed: iconUrl(`${key}-pressed`),
      cooldown: iconUrl(`${key}-cooldown`),
      insufficient: iconUrl(`${key}-insufficient`),
    },
  ]),
) as Record<SkillIconKey, Record<SkillIconState, string>>;

export function getSkillIcon(key: SkillIconKey, state: SkillIconState = "default"): string {
  return skillIcons[key][state];
}
