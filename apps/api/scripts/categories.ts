// The fixed category tree. Ids are slugs; a child's slug is its parent's
// slug plus one segment, so depth is visible in the id. Depth is at most 3.

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Node {
  name: string;
  children?: Record<string, Node>;
}

const TREE: Record<string, Node> = {
  brakes: {
    name: "Brakes",
    children: {
      pads: { name: "Brake pads" },
      discs: { name: "Brake discs" },
      drums: { name: "Brake drums" },
      shoes: { name: "Brake shoes" },
      calipers: { name: "Brake calipers" },
      hoses: { name: "Brake hoses" },
      sensors: { name: "Wear sensors" },
    },
  },
  filters: {
    name: "Filters",
    children: {
      oil: { name: "Oil filters" },
      air: { name: "Air filters" },
      cabin: { name: "Cabin filters" },
      fuel: { name: "Fuel filters" },
      transmission: { name: "Transmission filters" },
    },
  },
  lighting: {
    name: "Lighting",
    children: {
      bulbs: { name: "Bulbs" },
      headlamps: { name: "Headlamps" },
      "tail-lamps": { name: "Tail lamps" },
      indicators: { name: "Indicators" },
      "fog-lamps": { name: "Fog lamps" },
    },
  },
  wipers: {
    name: "Wipers",
    children: {
      blades: { name: "Wiper blades" },
      arms: { name: "Wiper arms" },
      motors: { name: "Wiper motors" },
      "washer-pumps": { name: "Washer pumps" },
    },
  },
  fluids: {
    name: "Fluids",
    children: {
      oil: { name: "Engine oil" },
      coolant: { name: "Coolant" },
      "brake-fluid": { name: "Brake fluid" },
      "washer-fluid": { name: "Washer fluid" },
      "transmission-fluid": { name: "Transmission fluid" },
      grease: { name: "Grease" },
    },
  },
  suspension: {
    name: "Suspension",
    children: {
      shocks: { name: "Shock absorbers" },
      springs: { name: "Coil springs" },
      struts: { name: "Strut mounts" },
      bushings: { name: "Bushings" },
      "control-arms": { name: "Control arms" },
      "ball-joints": { name: "Ball joints" },
      "stabiliser-links": { name: "Stabiliser links" },
    },
  },
  steering: {
    name: "Steering",
    children: {
      "tie-rods": { name: "Tie rods" },
      racks: { name: "Steering racks" },
      pumps: { name: "Power steering pumps" },
      boots: { name: "Steering boots" },
    },
  },
  engine: {
    name: "Engine",
    children: {
      belts: { name: "Drive belts" },
      tensioners: { name: "Belt tensioners" },
      gaskets: { name: "Gaskets" },
      mounts: { name: "Engine mounts" },
      "timing-kits": { name: "Timing kits" },
      "water-pumps": { name: "Water pumps" },
      thermostats: { name: "Thermostats" },
      ignition: {
        name: "Ignition",
        children: {
          "spark-plugs": { name: "Spark plugs" },
          "glow-plugs": { name: "Glow plugs" },
          coils: { name: "Ignition coils" },
        },
      },
    },
  },
  exhaust: {
    name: "Exhaust",
    children: {
      silencers: { name: "Silencers" },
      catalysts: { name: "Catalytic converters" },
      pipes: { name: "Exhaust pipes" },
      sensors: { name: "Lambda sensors" },
      mounts: { name: "Exhaust mounts" },
    },
  },
  electrical: {
    name: "Electrical",
    children: {
      batteries: { name: "Batteries" },
      alternators: { name: "Alternators" },
      starters: { name: "Starter motors" },
      sensors: { name: "Sensors" },
      relays: { name: "Relays" },
      fuses: { name: "Fuses" },
    },
  },
  cooling: {
    name: "Cooling",
    children: {
      radiators: { name: "Radiators" },
      fans: { name: "Radiator fans" },
      hoses: { name: "Coolant hoses" },
      "expansion-tanks": { name: "Expansion tanks" },
    },
  },
  clutch: {
    name: "Clutch",
    children: {
      kits: { name: "Clutch kits" },
      cylinders: { name: "Clutch cylinders" },
      flywheels: { name: "Flywheels" },
    },
  },
  body: {
    name: "Body",
    children: {
      mirrors: { name: "Mirror glass" },
      "door-handles": { name: "Door handles" },
      clips: { name: "Trim clips" },
    },
  },
};

function flatten(nodes: Record<string, Node>, parentId: string | null, out: Category[]): void {
  for (const [segment, node] of Object.entries(nodes)) {
    const id = parentId === null ? segment : `${parentId}/${segment}`;
    out.push({ id, name: node.name, parentId });
    if (node.children) flatten(node.children, id, out);
  }
}

/** Every category, parents before children, in a fixed order. */
export const CATEGORIES: readonly Category[] = (() => {
  const out: Category[] = [];
  flatten(TREE, null, out);
  return out;
})();

const parentIds = new Set(CATEGORIES.map((c) => c.parentId));

/** Categories a part can belong to. */
export const LEAF_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => !parentIds.has(c.id));

/** Leaves whose parts may be universal (fit every vehicle). */
export const UNIVERSAL_LEAVES: readonly Category[] = LEAF_CATEGORIES.filter(
  (c) => c.id === "lighting/bulbs" || c.id === "wipers/blades" || c.id.startsWith("fluids/"),
);

/** Leaves whose parts are axle-specific. */
export function isAxleCategory(id: string): boolean {
  return id.startsWith("brakes/") || id.startsWith("suspension/");
}

/** Top-level group of a slug, e.g. `brakes` for `brakes/pads`. */
export function groupOf(id: string): string {
  return id.split("/")[0] ?? id;
}
