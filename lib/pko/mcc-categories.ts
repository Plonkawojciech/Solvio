// ══════════════════════════════════════════════════════════════════════════════
// MCC Code → Solvio Category Mapping
// Maps Merchant Category Codes to default Solvio category names.
// ══════════════════════════════════════════════════════════════════════════════

interface MccMapping {
  categoryName: string
  label: string
}

/**
 * Map of MCC codes to Solvio category names.
 * Covers 60+ common MCC codes across major spending categories.
 */
const MCC_MAP: Record<string, MccMapping> = {
  // ── Groceries / Supermarkets ────────────────────────────────────────────────
  '5411': { categoryName: 'Groceries', label: 'Grocery stores / Supermarkets' },
  '5412': { categoryName: 'Groceries', label: 'Convenience stores' },
  '5422': { categoryName: 'Groceries', label: 'Freezer & locker meat provisioners' },
  '5441': { categoryName: 'Groceries', label: 'Candy / Nut / Confectionery stores' },
  '5451': { categoryName: 'Groceries', label: 'Dairy products stores' },
  '5462': { categoryName: 'Groceries', label: 'Bakeries' },
  '5499': { categoryName: 'Groceries', label: 'Miscellaneous food stores' },

  // ── Restaurants / Food ──────────────────────────────────────────────────────
  '5812': { categoryName: 'Restaurants', label: 'Eating places / Restaurants' },
  '5813': { categoryName: 'Restaurants', label: 'Bars / Pubs / Lounges' },
  '5814': { categoryName: 'Restaurants', label: 'Fast food restaurants' },

  // ── Transport — Fuel ────────────────────────────────────────────────────────
  '5541': { categoryName: 'Transport', label: 'Service stations (fuel)' },
  '5542': { categoryName: 'Transport', label: 'Automated fuel dispensers' },
  '5983': { categoryName: 'Transport', label: 'Fuel dealers' },

  // ── Transport — Public ──────────────────────────────────────────────────────
  '4111': { categoryName: 'Transport', label: 'Local commuter / Suburban transport' },
  '4112': { categoryName: 'Transport', label: 'Passenger railways' },
  '4121': { categoryName: 'Transport', label: 'Taxicabs / Limousines' },
  '4131': { categoryName: 'Transport', label: 'Bus lines' },
  '4511': { categoryName: 'Transport', label: 'Airlines / Air carriers' },
  '4784': { categoryName: 'Transport', label: 'Tolls / Bridge fees' },
  '4789': { categoryName: 'Transport', label: 'Transportation services' },
  '7512': { categoryName: 'Transport', label: 'Car rental agencies' },
  '7523': { categoryName: 'Transport', label: 'Parking lots / Garages' },

  // ── Shopping ────────────────────────────────────────────────────────────────
  '5311': { categoryName: 'Shopping', label: 'Department stores' },
  '5331': { categoryName: 'Shopping', label: 'Variety stores' },
  '5399': { categoryName: 'Shopping', label: 'General merchandise' },
  '5651': { categoryName: 'Shopping', label: 'Family clothing stores' },
  '5691': { categoryName: 'Shopping', label: 'Mens & womens clothing' },
  '5699': { categoryName: 'Shopping', label: 'Miscellaneous apparel' },
  '5611': { categoryName: 'Shopping', label: 'Mens & boys clothing' },
  '5621': { categoryName: 'Shopping', label: 'Womens ready-to-wear stores' },
  '5641': { categoryName: 'Shopping', label: 'Childrens & infants wear' },
  '5661': { categoryName: 'Shopping', label: 'Shoe stores' },
  '5944': { categoryName: 'Shopping', label: 'Jewelry / Watch / Clock stores' },
  '5945': { categoryName: 'Shopping', label: 'Hobby / Toy / Game shops' },

  // ── Health & Pharmacy ───────────────────────────────────────────────────────
  '5912': { categoryName: 'Health', label: 'Drug stores / Pharmacies' },
  '5975': { categoryName: 'Health', label: 'Hearing aids' },
  '5976': { categoryName: 'Health', label: 'Orthopedic goods' },
  '8011': { categoryName: 'Health', label: 'Doctors' },
  '8021': { categoryName: 'Health', label: 'Dentists / Orthodontists' },
  '8031': { categoryName: 'Health', label: 'Osteopaths' },
  '8041': { categoryName: 'Health', label: 'Chiropractors' },
  '8042': { categoryName: 'Health', label: 'Optometrists / Ophthalmologists' },
  '8049': { categoryName: 'Health', label: 'Other medical services' },
  '8050': { categoryName: 'Health', label: 'Nursing / Personal care' },
  '8062': { categoryName: 'Health', label: 'Hospitals' },
  '8099': { categoryName: 'Health', label: 'Health practitioners' },

  // ── Entertainment ───────────────────────────────────────────────────────────
  '7832': { categoryName: 'Entertainment', label: 'Motion picture theatres' },
  '7841': { categoryName: 'Entertainment', label: 'Video tape rental stores' },
  '7911': { categoryName: 'Entertainment', label: 'Dance halls / Studios / Schools' },
  '7922': { categoryName: 'Entertainment', label: 'Theatrical producers' },
  '7929': { categoryName: 'Entertainment', label: 'Bands / Orchestras / Entertainers' },
  '7932': { categoryName: 'Entertainment', label: 'Billiard & Pool establishments' },
  '7933': { categoryName: 'Entertainment', label: 'Bowling alleys' },
  '7941': { categoryName: 'Entertainment', label: 'Athletic clubs / Sports grounds' },
  '7991': { categoryName: 'Entertainment', label: 'Tourist attractions / Exhibits' },
  '7993': { categoryName: 'Entertainment', label: 'Video amusement game supplies' },
  '7994': { categoryName: 'Entertainment', label: 'Video game arcades' },
  '7996': { categoryName: 'Entertainment', label: 'Amusement parks / Circuses' },
  '7997': { categoryName: 'Entertainment', label: 'Membership clubs / Country clubs' },
  '7998': { categoryName: 'Entertainment', label: 'Aquariums / Seaquariums / Dolphinariums' },
  '7999': { categoryName: 'Entertainment', label: 'Recreation services' },

  // ── Housing / Utilities ─────────────────────────────────────────────────────
  '4814': { categoryName: 'Bills', label: 'Telecommunication services' },
  '4816': { categoryName: 'Bills', label: 'Computer network services' },
  '4899': { categoryName: 'Bills', label: 'Cable / Satellite / Pay TV' },
  '4900': { categoryName: 'Bills', label: 'Utilities — Electric / Gas / Water' },

  // ── Education ───────────────────────────────────────────────────────────────
  '8211': { categoryName: 'Education', label: 'Elementary & secondary schools' },
  '8220': { categoryName: 'Education', label: 'Colleges / Universities' },
  '8241': { categoryName: 'Education', label: 'Correspondence schools' },
  '8244': { categoryName: 'Education', label: 'Business & Secretarial schools' },
  '8249': { categoryName: 'Education', label: 'Trade & Vocational schools' },
  '8299': { categoryName: 'Education', label: 'Schools & Educational services' },

  // ── Home & Garden ───────────────────────────────────────────────────────────
  '5200': { categoryName: 'Home', label: 'Home supply warehouse stores' },
  '5211': { categoryName: 'Home', label: 'Building materials / Lumber' },
  '5231': { categoryName: 'Home', label: 'Glass / Paint / Wallpaper' },
  '5251': { categoryName: 'Home', label: 'Hardware stores' },
  '5261': { categoryName: 'Home', label: 'Nurseries / Lawn & Garden' },
  '5712': { categoryName: 'Home', label: 'Furniture / Home furnishings' },
  '5713': { categoryName: 'Home', label: 'Floor covering stores' },
  '5714': { categoryName: 'Home', label: 'Drapery & Upholstery stores' },
  '5719': { categoryName: 'Home', label: 'Miscellaneous home furnishing stores' },
  '5722': { categoryName: 'Home', label: 'Household appliance stores' },

  // ── Electronics / Digital ───────────────────────────────────────────────────
  '5045': { categoryName: 'Electronics', label: 'Computers / Peripherals / Software' },
  '5732': { categoryName: 'Electronics', label: 'Electronics stores' },
  '5734': { categoryName: 'Electronics', label: 'Computer software stores' },
  '5735': { categoryName: 'Electronics', label: 'Record stores' },
  '5816': { categoryName: 'Subscriptions', label: 'Digital goods — games' },
  '5817': { categoryName: 'Subscriptions', label: 'Digital goods — applications' },
  '5818': { categoryName: 'Subscriptions', label: 'Digital goods — large merchant' },

  // ── Travel / Hotels ─────────────────────────────────────────────────────────
  '3501': { categoryName: 'Travel', label: 'Hotels & Motels' },
  '7011': { categoryName: 'Travel', label: 'Hotels / Motels / Resorts' },
  '7012': { categoryName: 'Travel', label: 'Timeshares' },
  '4722': { categoryName: 'Travel', label: 'Travel agencies / Tour operators' },

  // ── Insurance ───────────────────────────────────────────────────────────────
  '6300': { categoryName: 'Insurance', label: 'Insurance — general' },
  '6381': { categoryName: 'Insurance', label: 'Insurance premiums' },
  '6399': { categoryName: 'Insurance', label: 'Insurance — not classified' },

  // ── Financial Services ──────────────────────────────────────────────────────
  '6010': { categoryName: 'Finance', label: 'Financial institution — manual cash' },
  '6011': { categoryName: 'Finance', label: 'Financial institution — ATM' },
  '6012': { categoryName: 'Finance', label: 'Financial institution — merchandise & services' },
  '6051': { categoryName: 'Finance', label: 'Non-financial institutions — foreign currency' },

  // ── Automotive ──────────────────────────────────────────────────────────────
  '5511': { categoryName: 'Auto', label: 'Auto & truck dealers — new & used' },
  '5521': { categoryName: 'Auto', label: 'Auto & truck dealers — used' },
  '5531': { categoryName: 'Auto', label: 'Auto & home supply stores' },
  '5532': { categoryName: 'Auto', label: 'Automotive tire stores' },
  '5533': { categoryName: 'Auto', label: 'Automotive parts & accessories' },
  '7531': { categoryName: 'Auto', label: 'Auto body repair shops' },
  '7534': { categoryName: 'Auto', label: 'Tire retreading & repair' },
  '7535': { categoryName: 'Auto', label: 'Paint shops' },
  '7538': { categoryName: 'Auto', label: 'Automotive service shops' },
  '7542': { categoryName: 'Auto', label: 'Car washes' },

  // ── Personal Care ───────────────────────────────────────────────────────────
  '7230': { categoryName: 'Personal', label: 'Beauty & Barber shops' },
  '7297': { categoryName: 'Personal', label: 'Massage parlors / Health spas' },
  '7298': { categoryName: 'Personal', label: 'Health & Beauty spas' },

  // ── Pets ────────────────────────────────────────────────────────────────────
  '0742': { categoryName: 'Pets', label: 'Veterinary services' },
  '5995': { categoryName: 'Pets', label: 'Pet shops / Pet food' },
}

/**
 * Look up a Solvio category name by MCC code.
 * Returns the category name if found, or null if the MCC code is unknown.
 */
export function getCategoryByMcc(mccCode: string | undefined | null): string | null {
  if (!mccCode) return null
  const mapping = MCC_MAP[mccCode.trim()]
  return mapping?.categoryName ?? null
}

/**
 * Get the human-readable label for an MCC code.
 */
export function getMccLabel(mccCode: string | undefined | null): string | null {
  if (!mccCode) return null
  const mapping = MCC_MAP[mccCode.trim()]
  return mapping?.label ?? null
}

/**
 * Get all supported MCC codes and their mappings.
 */
export function getAllMccMappings(): Record<string, MccMapping> {
  return { ...MCC_MAP }
}
