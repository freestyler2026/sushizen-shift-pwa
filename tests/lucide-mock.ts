/**
 * A lucide-react mock that cannot be made stale by adding an icon.
 *
 * Every test file used to mock lucide-react with an exhaustive list of the
 * icons its own page imported. That holds only until a shared component starts
 * drawing one of its own: SelectDark renders a ChevronDown, and when the
 * native <select> sweep put SelectDark on every admin page, thirty test files
 * were suddenly mocking a module that no longer had the icon their page's
 * children needed.
 *
 * The failure is worse than a missing export. React throws inside render, the
 * page comes out empty, and every assertion in the file then fails on
 * "Unable to find an element with the text ..." -- pointing at the text rather
 * than at the icon. 752 tests failed that way, each waiting out its own
 * five-second timeout, and the suite went from seconds to hours.
 *
 * So: name the icons you want to assert on, and let every other one resolve to
 * something harmless.
 */

/** Keys the module system asks about, which must stay absent. Answering
 *  `then` in particular makes the namespace look thenable and hangs `await`. */
const RESERVED = ["then", "default", "__esModule"];

const real = (k: string | symbol) =>
  typeof k === "string" && !RESERVED.includes(k);

export function lucideMock(named: Record<string, unknown> = {}) {
  return new Proxy(named, {
    // `has` matters as much as `get`. Vitest checks `key in module` and raises
    // its own "No X export is defined on the mock" before any get trap runs, so
    // a Proxy with only a get trap fails exactly as an object literal does.
    has: (_t, k) => real(k),
    get: (t, k) => (k in t ? t[k as string] : real(k) ? () => null : undefined),
  });
}
