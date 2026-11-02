import { newItem, type LineItem } from "./quotation";

export const packageTemplates = {
  kitchen: {
    name: "Modular kitchen",
    section: "Carpentry",
    room: "Kitchen",
    headings: [
      "Layout & dimensions",
      "Carcass & shutters",
      "Hardware & accessories",
      "Finish",
      "Installation & warranty",
    ],
  },
  wardrobe: {
    name: "Wardrobe",
    section: "Carpentry",
    room: "Bedroom",
    headings: [
      "Dimensions",
      "Material specification",
      "Shutters & storage",
      "Hardware",
      "Finish",
      "Installation & warranty",
    ],
  },
  bed: {
    name: "Bed, headboard & side tables",
    section: "Carpentry",
    room: "Bedroom",
    headings: [
      "Bed structure & dimensions",
      "Storage mechanism",
      "Headboard & side tables",
      "Hardware & finish",
      "Installation & warranty",
    ],
  },
  electrical: {
    name: "Electrical & lighting package",
    section: "Electrical",
    room: "Whole property",
    headings: [
      "Point schedule & locations",
      "Wiring & switches",
      "Light fittings & brands",
      "Included installation",
      "Exclusions & warranty",
    ],
  },
  ceiling: {
    name: "False ceiling",
    section: "Civil works",
    room: "Living room",
    headings: [
      "Areas & dimensions",
      "Board & framing specification",
      "Lighting provisions",
      "Finish & installation",
    ],
  },
} as const;

export function packageItem(key: keyof typeof packageTemplates): LineItem {
  const template = packageTemplates[key];
  return {
    ...newItem(),
    name: template.name,
    room: template.room,
    section: template.section,
    unit: "lump sum",
    specifications: template.headings.map((heading) => ({
      id: crypto.randomUUID(),
      heading,
      body: "",
    })),
  };
}

export function saveableTemplate(item: LineItem): LineItem {
  return {
    ...structuredClone(item),
    id: crypto.randomUUID(),
    rate: "",
    quantity: item.unit === "lump sum" ? "1" : "",
    changes: "",
  };
}

export function instantiateTemplate(template: LineItem): LineItem {
  return {
    ...saveableTemplate(template),
    specifications: template.specifications.map((spec) => ({
      ...spec,
      id: crypto.randomUUID(),
    })),
  };
}
