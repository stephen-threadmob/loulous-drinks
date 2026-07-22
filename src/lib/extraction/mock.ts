import type { ExtractionResult } from "@/lib/types";

// Mock menu extractor. Returns a realistic parsed drink menu WITHOUT reading the
// file, so the whole upload -> review -> publish workflow is fully testable with
// no external API key. The admin still must review and approve before anything
// is published. Swap this for a live provider by setting MENU_EXTRACTION_PROVIDER
// (see ./providers.ts).
export async function extractMock(fileName: string): Promise<ExtractionResult> {
  // Simulate processing latency so loading states are visible in the UI.
  await new Promise((r) => setTimeout(r, 900));

  return {
    provider: "mock",
    notes: [
      "This is a MOCK extraction result. No AI/OCR ran on your file.",
      "Two prices were detected for several wines and interpreted as glass / bottle — please confirm.",
      "The price for “Chef's Special Punch” was unreadable and left blank — please fill it in.",
      "Review every item, price, and modifier below before publishing.",
    ],
    categories: [
      {
        name: "Cocktails",
        items: [
          {
            name: "House Margarita",
            description: "Blanco tequila, lime, triple sec, agave",
            price_cents: 1200,
            modifier_groups: [
              {
                name: "Rim",
                selection_type: "single",
                required: false,
                options: [
                  { name: "Salt rim" },
                  { name: "No salt" },
                  { name: "Sugar rim" },
                ],
              },
              {
                name: "Ice",
                selection_type: "single",
                required: false,
                options: [
                  { name: "Regular ice" },
                  { name: "Light ice" },
                  { name: "Extra ice" },
                ],
              },
            ],
          },
          {
            name: "Old Fashioned",
            description: "Bourbon, simple syrup, bitters, orange",
            price_cents: 1400,
            modifier_groups: [
              {
                name: "Whiskey",
                selection_type: "single",
                required: true,
                options: [{ name: "Rye" }, { name: "Bourbon" }],
              },
            ],
          },
          {
            name: "Chef's Special Punch",
            description: "Seasonal — ask your server",
            price_cents: null,
            uncertain: true,
          },
        ],
      },
      {
        name: "Wine",
        items: [
          {
            name: "House Red Blend",
            description: "Glass / bottle",
            price_cents: 900,
            bottle_price_cents: 3200,
          },
          {
            name: "Sauvignon Blanc",
            description: "Glass / bottle",
            price_cents: 1100,
            bottle_price_cents: 3900,
          },
        ],
      },
      {
        name: "Beer",
        items: [
          { name: "Draft IPA", description: "16 oz", price_cents: 700 },
          { name: "Domestic Lager", description: "Bottle", price_cents: 500 },
        ],
      },
      {
        name: "Non-Alcoholic",
        items: [
          { name: "Fountain Soda", price_cents: 350 },
          { name: "Iced Tea", price_cents: 325 },
        ],
      },
    ],
  };
}
