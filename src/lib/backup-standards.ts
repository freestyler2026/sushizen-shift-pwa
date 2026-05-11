// src/lib/backup-standards.ts
// Shared standards for backup report items (Manila).
// "qty" items: numeric minimum in the same unit as the template.
// "pct" items: minimum fill % of container — stored as 0/25/50/75/100.

export type StandardSpec =
  | { type: "qty"; min: number; label: string }
  | { type: "pct"; min: number; label: string };

// ─── Standards by item KEY (used in backup entry form) ───────────────────────

export const MANILA_STANDARDS: Record<string, StandardSpec> = {
  // Condiments & Supplies
  m_soy_sauce:        { type: "qty", min: 150, label: "150+ pcs" },
  m_wasabi:           { type: "qty", min: 150, label: "150+ pcs" },
  m_ginger:           { type: "qty", min: 150, label: "150+ pcs" },
  m_swg_set:          { type: "qty", min: 30,  label: "30+ sets" },
  m_miso_soup:        { type: "qty", min: 10,  label: "10+ pcs" },
  m_sweet_sauce:      { type: "qty", min: 10,  label: "10+ pcs" },
  m_dumpling_sauce:   { type: "qty", min: 10,  label: "10+ pcs" },
  // Packaging
  m_ice_pack:         { type: "qty", min: 100, label: "100+ pcs" },
  m_box_12:           { type: "qty", min: 30,  label: "30+ pcs" },
  m_box_16:           { type: "qty", min: 30,  label: "30+ pcs" },
  m_box_24:           { type: "qty", min: 30,  label: "30+ pcs" },
  // Prepared Ingredients
  m_quezo_cheese:     { type: "pct", min: 50,  label: "50% of container" },
  m_crabstick_cut:    { type: "qty", min: 0.5, label: "500g (0.5kg)" },
  m_cucumber_cut:     { type: "qty", min: 3,   label: "3kg" },
  m_seasoned_upo:     { type: "pct", min: 50,  label: "50% of container" },
  m_crabstick_mayo:   { type: "pct", min: 75,  label: "75% of container" },
  m_spicy_tuna_chunk: { type: "pct", min: 75,  label: "75% of container" },
  m_mango_base:       { type: "pct", min: 50,  label: "50% of container" },
  m_pickled_papaya:   { type: "pct", min: 75,  label: "75% of container" },
  m_salmon_skin_mix:  { type: "pct", min: 75,  label: "75% of container" },
  // Toppings & Flakes
  m_spring_onion_top: { type: "pct", min: 75,  label: "75% of container" },
  m_crabmayo_top:     { type: "pct", min: 50,  label: "50% of container" },
  m_salmon_skin_top:  { type: "pct", min: 50,  label: "50% of container" },
  m_cheese_dice:      { type: "pct", min: 25,  label: "25% of container" },
  m_mango_cube:       { type: "pct", min: 25,  label: "25% of container" },
  m_spicy_tuna_mix:   { type: "pct", min: 25,  label: "25% of container" },
  m_red_chili:        { type: "pct", min: 25,  label: "25% of container" },
  m_mint_leaves:      { type: "pct", min: 25,  label: "25% of container" },
  m_onion_leeks:      { type: "pct", min: 25,  label: "25% of container" },
  m_tf_white:         { type: "pct", min: 75,  label: "75% of container" },
  m_tf_orange:        { type: "pct", min: 75,  label: "75% of container" },
  m_tf_red:           { type: "pct", min: 75,  label: "75% of container" },
  m_tf_yellow:        { type: "pct", min: 50,  label: "50% of container" },
  m_tf_pink:          { type: "pct", min: 50,  label: "50% of container" },
  m_fried_dumplings:  { type: "pct", min: 75,  label: "75% of container" },
  m_shichimi:         { type: "pct", min: 50,  label: "50% of container" },
  m_all_sauces:       { type: "pct", min: 75,  label: "75% of container" },
  // Hot Section
  m_spring_onion_hot: { type: "pct", min: 50,  label: "50% of container" },
  m_seasoned_egg:     { type: "qty", min: 10,  label: "10 pcs" },
  m_kikurage:         { type: "pct", min: 50,  label: "50% of container" },
  m_fried_camote:     { type: "pct", min: 50,  label: "50% of container" },
  m_boiled_cabbage:   { type: "pct", min: 50,  label: "50% of container" },
  m_boiled_beansprout:{ type: "pct", min: 50,  label: "50% of container" },
  m_boiled_carrot:    { type: "pct", min: 50,  label: "50% of container" },
  m_sliced_onion:     { type: "pct", min: 50,  label: "50% of container" },
  m_bok_choy:         { type: "pct", min: 50,  label: "50% of container" },
  m_bamboo_shoot:     { type: "pct", min: 50,  label: "50% of container" },
  m_sweet_corn:       { type: "pct", min: 50,  label: "50% of container" },
  m_kurodama:         { type: "pct", min: 50,  label: "50% of container" },
  m_akadama:          { type: "pct", min: 50,  label: "50% of container" },
  m_shredded_cabbage: { type: "pct", min: 75,  label: "75% of container" },
  m_chopped_leeks:    { type: "pct", min: 25,  label: "25% of container" },
  m_baguio_beans:     { type: "pct", min: 25,  label: "25% of container" },
  m_benishoga:        { type: "pct", min: 25,  label: "25% of container" },
  m_fried_garlic:     { type: "pct", min: 25,  label: "25% of container" },
  m_wakame:           { type: "pct", min: 50,  label: "50% of container" },
  // Base Roll — no standard (determined by baseroll-prep calculator)
};

// ─── Standards by item LABEL (used in analytics — matches item_name_snapshot in DB) ─

export const MANILA_LABEL_STANDARDS: Record<string, StandardSpec> = {
  "Soy Sauce":                       { type: "qty", min: 150, label: "150+ pcs" },
  "Wasabi":                          { type: "qty", min: 150, label: "150+ pcs" },
  "Ginger":                          { type: "qty", min: 150, label: "150+ pcs" },
  "Soy Sauce, Wasabi, Ginger Set":   { type: "qty", min: 30,  label: "30+ sets" },
  "Miso Soup":                       { type: "qty", min: 10,  label: "10+ pcs" },
  "Sweet Sauce":                     { type: "qty", min: 10,  label: "10+ pcs" },
  "Dumpling Sauce":                  { type: "qty", min: 10,  label: "10+ pcs" },
  "Ice Pack":                        { type: "qty", min: 100, label: "100+ pcs" },
  "Box12 Set":                       { type: "qty", min: 30,  label: "30+ pcs" },
  "Box16 Set":                       { type: "qty", min: 30,  label: "30+ pcs" },
  "Box24 Set":                       { type: "qty", min: 30,  label: "30+ pcs" },
  "Quezo Cheese Cut":                { type: "pct", min: 50,  label: "50% of container" },
  "Crabstick Cut":                   { type: "qty", min: 0.5, label: "500g (0.5kg)" },
  "Cucumber Cut":                    { type: "qty", min: 3,   label: "3kg" },
  "Seasoned Upo":                    { type: "pct", min: 50,  label: "50% of container" },
  "Crabstick Mayo":                  { type: "pct", min: 75,  label: "75% of container" },
  "Spicy Tuna Chunk":                { type: "pct", min: 75,  label: "75% of container" },
  "Mango Cut (For Base Roll)":       { type: "pct", min: 50,  label: "50% of container" },
  "Pickled Papaya":                  { type: "pct", min: 75,  label: "75% of container" },
  "Salmon Skin Mix":                 { type: "pct", min: 75,  label: "75% of container" },
  "Crabstick Mayo for Topping":      { type: "pct", min: 50,  label: "50% of container" },
  "Salmon Skin Mix for Topping":     { type: "pct", min: 50,  label: "50% of container" },
  "Cheese Dice Cut":                 { type: "pct", min: 25,  label: "25% of container" },
  "Mango Cube":                      { type: "pct", min: 25,  label: "25% of container" },
  "Spicy Tuna Mix":                  { type: "pct", min: 25,  label: "25% of container" },
  "Red Chili Cut":                   { type: "pct", min: 25,  label: "25% of container" },
  "Mint Leaves":                     { type: "pct", min: 25,  label: "25% of container" },
  "Onion Leeks":                     { type: "pct", min: 25,  label: "25% of container" },
  "Tempura Flakes White":            { type: "pct", min: 75,  label: "75% of container" },
  "Tempura Flakes Orange":           { type: "pct", min: 75,  label: "75% of container" },
  "Tempura Flakes Red":              { type: "pct", min: 75,  label: "75% of container" },
  "Tempura Flakes Yellow":           { type: "pct", min: 50,  label: "50% of container" },
  "Tempura Flakes Pink":             { type: "pct", min: 50,  label: "50% of container" },
  "Fried Dumplings":                 { type: "pct", min: 75,  label: "75% of container" },
  "Shichimi Powder":                 { type: "pct", min: 50,  label: "50% of container" },
  "All Sauces":                      { type: "pct", min: 75,  label: "75% of container" },
  "Seasoned Egg":                    { type: "qty", min: 10,  label: "10 pcs" },
  "Kikurage":                        { type: "pct", min: 50,  label: "50% of container" },
  "Fried Camote":                    { type: "pct", min: 50,  label: "50% of container" },
  "Boiled Cabbage":                  { type: "pct", min: 50,  label: "50% of container" },
  "Boiled Beansprout":               { type: "pct", min: 50,  label: "50% of container" },
  "Boiled Carrot":                   { type: "pct", min: 50,  label: "50% of container" },
  "Sliced Onion":                    { type: "pct", min: 50,  label: "50% of container" },
  "Bok Choy":                        { type: "pct", min: 50,  label: "50% of container" },
  "Bamboo Shoot":                    { type: "pct", min: 50,  label: "50% of container" },
  "Sweet Corn":                      { type: "pct", min: 50,  label: "50% of container" },
  "Kurodama (Black Mince)":          { type: "pct", min: 50,  label: "50% of container" },
  "Akadama (Red Mince)":             { type: "pct", min: 50,  label: "50% of container" },
  "Shredded Cabbage for Bento":      { type: "pct", min: 75,  label: "75% of container" },
  "Chopped Leeks":                   { type: "pct", min: 25,  label: "25% of container" },
  "Baguio Beans":                    { type: "pct", min: 25,  label: "25% of container" },
  "Benishoga (Red Ginger)":          { type: "pct", min: 25,  label: "25% of container" },
  "Wakame":                          { type: "pct", min: 50,  label: "50% of container" },
  // Note: "Spring Onion" appears in both Toppings (75%) and Hot Section (50%).
  // Analytics uses the Toppings standard (75%) as the primary. Section-specific
  // overrides can be added if needed.
  "Spring Onion":                    { type: "pct", min: 50,  label: "50% of container" },
};

export function getLabelStandards(city: string): Record<string, StandardSpec> {
  if (city === "manila") return MANILA_LABEL_STANDARDS;
  return {};
}
