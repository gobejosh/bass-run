/**
 * Icônes en SVG (couleur du texte). Les polices embarquées ne contiennent ni ✓, ni ←, ni ✕ : sans SVG, ces signes
 * viendraient d'une police système différente selon l'appareil.
 */
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  back: "M19 12H5M11 6l-6 6l6 6",
  forward: "M5 12h14M13 6l6 6l-6 6",
  prev: "M15 5l-7 7l7 7",
  next: "M9 5l7 7l-7 7",
  up: "M12 19V5M6 11l6-6l6 6",
  down: "M12 5v14M6 13l6 6l6-6",
  swap: "M4 8h14M14 4l4 4l-4 4M20 16H6M10 12l-4 4l4 4",
  close: "M6 6l12 12M18 6L6 18",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <path d={PATHS[name]} />
    </svg>
  );
}
