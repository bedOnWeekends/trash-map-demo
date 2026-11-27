import type { Transition, Variants } from "motion/react";

// Seconds for Motion. The corresponding CSS custom properties use milliseconds.
export const duration = {
  instant: 0.1,
  micro: 0.15,
  fast: 0.2,
  standard: 0.25,
  panel: 0.3,
  layout: 0.35,
  emphasis: 0.45,
  shimmer: 1.4,
} as const;
export const ease = {
  standard: [0.2, 0, 0.2, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;
export const distance = { micro: 4, reveal: 8, slide: 16 } as const;
export const scale = {
  press: 0.97,
  dialog: 0.95,
  select: 0.9,
  emphasis: 1.06,
} as const;
export const spring = {
  type: "spring",
  stiffness: 430,
  damping: 38,
} satisfies Transition;
export const tween = (time: number = duration.standard): Transition => ({
  duration: time,
  ease: ease.standard,
});
export const slideFade: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * distance.slide }),
  visible: { opacity: 1, x: 0 },
  leave: (direction: number) => ({
    opacity: 0,
    x: -direction * distance.slide,
  }),
};
