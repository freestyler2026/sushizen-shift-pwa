/**
 * Talabat Dubai: portal vendor name → our store code.
 *
 * Kept in one file because two scripts need it and a second copy is how the
 * two quietly disagree about which branch a number belongs to (lesson 62).
 *
 * ⚠️ Unknown names fall back to a slug rather than throwing: the payout run
 * must not stop because Talabat added a brand. `unmapped()` reports them so a
 * new one is noticed instead of silently filed under a made-up code.
 */
const NAME_TO_CODE = {
  'sushi zen, al hudaiba':                        'AM',
  'sushi zen,  al hudaiba':                       'AM',
  'sushi zen, al barsha 3':                       'AB',
  'sushi zen, al barsha south':                   'ARJ',
  'sushi zen, business bay':                      'BB',
  'sushi zen, jumeirah lakes towers - jlt':       'JLT',
  // Ramen Zen was Arjan and Business Bay only (checked 2026-08-21). A third
  // appeared at JLT in the store-status list on 2026-09-11.
  'ramen zen, arjan':                             'RZ_ARJ',
  'ramen zen, business bay':                      'RZ_BB',
  'ramen zen, jumeirah lakes towers - jlt':       'RZ_JLT',
  'ramen zen, al hudaiba':                        'RZ_AM',
  'all veggie sushi, al barsha, al barsha 3':     'VEGGIE_AB',
  // JJAD: AM and JLT in chain 673913 (old); ARJ and BB in chain 694540 (new billing)
  'j - japanese authentic deli, al hudaiba':      'JJAD_AM',
  'j - japanese authentic deli, arjan':           'JJAD_ARJ',
  'j - japanese authentic deli, business bay':    'JJAD_BB',
  'j - japanese authentic deli, jlt, jumeirah lakes towers - jlt': 'JJAD_JLT',
};

function storeCode(name) {
  return NAME_TO_CODE[(name || '').toLowerCase().trim()]
    || (name || 'unknown').replace(/[^a-z0-9]/gi, '_').toUpperCase().slice(0, 10);
}

function unmapped(names) {
  return [...new Set(names.filter(n => !NAME_TO_CODE[(n || '').toLowerCase().trim()]))];
}

module.exports = { NAME_TO_CODE, storeCode, unmapped };
