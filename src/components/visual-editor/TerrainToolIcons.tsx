/**
 * Terrain tool glyphs.
 *
 * Drawn rather than imported so a brush reads as what it does to ground: each
 * one shows a surface in profile with the edit applied to it. They carry no
 * meaning on their own — every caller pairs them with a readable label.
 */

type IconProps = { className?: string };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Glyph({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Ground pushed up into a mound, with an arrow leaving it. */
export function TerrainRaiseIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 12.5h14" />
      <path {...STROKE} d="M3.5 12.5c1.6-4 3-6 4.5-6s2.9 2 4.5 6" />
      <path {...STROKE} d="M8 4.5V1M6.4 2.6 8 1l1.6 1.6" />
    </Glyph>
  );
}

/** The same mound inverted into a pit, with an arrow entering it. */
export function TerrainLowerIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 4.5h14" />
      <path {...STROKE} d="M3.5 4.5c1.6 4 3 6 4.5 6s2.9-2 4.5-6" />
      <path {...STROKE} d="M8 12.5V15M6.4 13.4 8 15l1.6-1.6" />
    </Glyph>
  );
}

/** A ruled level line cutting through uneven ground. */
export function TerrainFlattenIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 8h14" />
      <path {...STROKE} d="M3 12.5c1.2-2 2-3 3-3s1.4 1 2.4 1 1.8-1.6 3.6-4.2" opacity="0.55" />
      <path {...STROKE} d="M2.5 6.2 4 8l-1.5 1.8M13.5 6.2 12 8l1.5 1.8" />
    </Glyph>
  );
}

/** A jagged profile easing into a smooth one. */
export function TerrainSmoothIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 11.5c1.2 0 1.4-5 2.6-5s1.2 5 2.4 5" opacity="0.55" />
      <path {...STROKE} d="M6 11.5c2 0 2.6-4.5 4.5-4.5S14 11.5 15 11.5" />
    </Glyph>
  );
}

/** A disc pressed onto the surface. */
export function TerrainStampIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 13h14" />
      <ellipse {...STROKE} cx="8" cy="9.5" rx="4.5" ry="1.8" />
      <path {...STROKE} d="M6 9.5V5.5a2 2 0 0 1 4 0v4" />
    </Glyph>
  );
}

/** Ground with a gap punched through it. */
export function TerrainHoleAddIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 9h4M11 9h4" />
      <path {...STROKE} d="M5 9c0 2.2.9 3.5 3 3.5s3-1.3 3-3.5" strokeDasharray="2 1.6" />
      <path {...STROKE} d="M8 1.5v3.8M6.6 4.1 8 5.5l1.4-1.4" />
    </Glyph>
  );
}

/** The gap bridged back over. */
export function TerrainHoleRemoveIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 9h14" />
      <path {...STROKE} d="M5 9c0 2.2.9 3.5 3 3.5s3-1.3 3-3.5" opacity="0.35" strokeDasharray="2 1.6" />
      <path {...STROKE} d="M8 5.5V1.7M6.6 3.1 8 1.7l1.4 1.4" />
    </Glyph>
  );
}

/** Blades standing on a line. */
export function TerrainGrassIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 13h14" />
      <path {...STROKE} d="M4 13c0-3 -.8-4.6-2-5.6M4 13c0-3.4 1-5.2 2.4-6.2" />
      <path {...STROKE} d="M10.5 13c0-3 -.8-4.6-2-5.6M10.5 13c0-3.4 1-5.2 2.4-6.2" />
    </Glyph>
  );
}

/** A brush tip over blades: painting coverage rather than height. */
export function TerrainGrassPaintIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 13.5h14" />
      <path {...STROKE} d="M3.5 13.5c0-2.4-.6-3.7-1.6-4.5M3.5 13.5c0-2.7.8-4.2 1.9-5" />
      <path {...STROKE} d="M9 9.5 13.4 3a1.4 1.4 0 0 1 2 1.8L10.8 11z" />
      <path {...STROKE} d="M9 9.5 8 12l2.8-1z" />
    </Glyph>
  );
}

/** An eraser over blades. */
export function TerrainGrassEraseIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M1 13.5h14" />
      <path {...STROKE} d="M3.5 13.5c0-2.4-.6-3.7-1.6-4.5M3.5 13.5c0-2.7.8-4.2 1.9-5" />
      <path {...STROKE} d="m8.4 13.5 6.1-6.1a1.5 1.5 0 0 0 0-2.1l-1.8-1.8a1.5 1.5 0 0 0-2.1 0L6 8.1a1.5 1.5 0 0 0 0 2.1l3.3 3.3" />
    </Glyph>
  );
}

/** Layered bands: the surface material stack. */
export function TerrainSurfaceIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path {...STROKE} d="M8 1.5 14.5 5 8 8.5 1.5 5z" />
      <path {...STROKE} d="M1.5 8 8 11.5 14.5 8" opacity="0.6" />
      <path {...STROKE} d="M1.5 11 8 14.5 14.5 11" opacity="0.35" />
    </Glyph>
  );
}
