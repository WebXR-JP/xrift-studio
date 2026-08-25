/**
 * Stable ids for the Assets XRift Studio ships with every project.
 *
 * These live apart from the Assets themselves so both the creation catalog and
 * the prototype project can name one without importing the other's module.
 */
export const BUILTIN_ASSET_IDS = {
  geometry: {
    box: "builtin-geometry-box",
    sphere: "builtin-geometry-sphere",
    cylinder: "builtin-geometry-cylinder",
    cone: "builtin-geometry-cone",
    plane: "builtin-geometry-plane",
  },
  material: {
    blue: "builtin-material-blue",
    violet: "builtin-material-violet",
    green: "builtin-material-green",
    orange: "builtin-material-orange",
    slate: "builtin-material-slate",
    wood: "builtin-material-wood",
    sand: "builtin-material-sand",
    white: "builtin-material-white",
    charcoal: "builtin-material-charcoal",
    glow: "builtin-material-glow",
  },
} as const;
