/** Automotive vocabulary mapping.
 *
 * This is the component that makes natural language work without a model.
 * You say "sway bar"; GM wrote "Stabilizer Shaft". You say "lug nut"; GM wrote
 * "Wheel Nut". No amount of embedding similarity reliably bridges that gap for
 * short strings, but a lookup table bridges it exactly.
 *
 * Every entry is bidirectional: each group expands to every other member.
 */

export const SYNONYM_GROUPS: string[][] = [
  // --- suspension -------------------------------------------------------
  ["sway bar", "swaybar", "stabilizer shaft", "stabilizer bar", "anti roll bar", "antiroll bar", "roll bar"],
  ["end link", "endlink", "link", "sway bar link", "drop link"],
  ["shock", "shock absorber", "damper", "strut"],
  ["control arm", "a arm", "aarm", "wishbone"],
  ["ball joint", "balljoint"],
  ["knuckle", "steering knuckle", "spindle", "upright"],
  ["hub", "wheel hub", "wheel bearing", "bearing assembly"],
  ["tie rod", "tierod", "track rod"],
  ["crossmember", "cross member", "k member", "kmember", "subframe"],
  ["bushing", "insulator", "bush"],
  ["coil spring", "transverse spring", "leaf spring", "spring"],
  ["cam bolt", "camber bolt", "eccentric bolt", "alignment bolt"],

  // --- brakes -----------------------------------------------------------
  ["caliper", "brake caliper"],
  ["rotor", "brake rotor", "brake disc", "disc"],
  ["pad", "brake pad"],
  ["bleeder", "bleed screw", "bleeder screw", "bleed valve"],
  ["banjo bolt", "inlet fitting", "brake hose bolt", "hose fitting"],
  ["master cylinder", "brake master"],
  ["booster", "brake booster", "power booster"],
  ["guide pin", "slide pin", "caliper bolt", "caliper pin"],

  // --- wheels -----------------------------------------------------------
  ["lug nut", "lugnut", "wheel nut", "wheel lug", "lug"],
  ["wheel stud", "lug stud"],

  // --- driveline --------------------------------------------------------
  // "rear end" and "pumpkin" unambiguously mean the differential. "rear axle"
  // does NOT — it is just as often the hub/spindle nut or the half-shaft, so
  // treating it as diff slang injected the whole differential vocabulary into
  // "rear axle nut" and pulled the answer onto the diff cover bolts.
  ["differential", "diff", "rear end", "pumpkin"],
  ["ring gear", "crown wheel"],
  ["pinion nut", "pinion"],
  ["driveshaft", "drive shaft", "propeller shaft", "prop shaft", "propshaft"],
  ["halfshaft", "half shaft", "axle shaft", "cv shaft", "drive axle", "wheel drive shaft"],
  ["torque tube", "driveline support"],
  ["transmission", "trans", "tranny", "gearbox"],
  ["bellhousing", "bell housing", "clutch housing", "flywheel housing"],
  ["flexplate", "flex plate", "flywheel"],
  ["torque converter", "converter"],
  ["u joint", "ujoint", "universal joint"],
  ["pressure plate", "clutch pressure plate"],

  // --- engine -----------------------------------------------------------
  ["head bolt", "cylinder head bolt", "head stud"],
  ["main cap", "main bearing cap", "crankshaft bearing cap", "main bolt"],
  ["rod bolt", "connecting rod bolt", "con rod bolt", "rod cap bolt"],
  ["harmonic balancer", "crank pulley", "crankshaft balancer", "crank bolt", "balancer bolt", "damper bolt"],
  ["valve cover", "rocker cover", "valve rocker arm cover", "cam cover"],
  ["rocker arm", "valve rocker arm", "rocker"],
  ["intake", "intake manifold", "inlet manifold", "plenum"],
  ["exhaust manifold", "header", "headers", "exhaust header"],
  ["oil pan", "sump", "oil sump"],
  ["oil pump", "pump"],
  ["water pump", "coolant pump"],
  ["thermostat", "thermostat housing", "water inlet", "water inlet housing"],
  ["spark plug", "plug", "plugs"],
  ["throttle body", "tb", "throttle"],
  ["cam", "camshaft"],
  ["timing cover", "front cover", "engine front cover"],
  ["motor mount", "engine mount", "engine mount bracket"],
  ["o2 sensor", "oxygen sensor", "lambda sensor", "heated oxygen sensor"],
  ["knock sensor", "det sensor"],
  ["crank sensor", "crankshaft position sensor", "ckp"],
  ["cam sensor", "camshaft position sensor", "cmp"],
  ["alternator", "alt", "generator"],
  ["ac compressor", "a c compressor", "air conditioning compressor", "compressor"],
  ["power steering pump", "ps pump", "steering pump"],
  ["belt tensioner", "tensioner", "drive belt tensioner"],
  ["idler pulley", "idler"],
  ["starter", "starter motor"],
  ["dipstick", "oil level indicator"],
  ["drain plug", "oil drain plug", "sump plug"],
  ["oil filter", "filter"],
  ["fuel rail", "injector rail"],
  ["coil", "ignition coil", "coil pack"],

  // --- steering ---------------------------------------------------------
  ["steering rack", "steering gear", "rack and pinion", "rack"],
  ["pitman arm", "steering arm"],
  ["steering column", "column"],
  ["steering shaft", "intermediate shaft", "steering coupler", "coupling"],
  // Must exist as its own phrase so it claims the span in "steering wheel
  // nut" before the lug-nut group can match the trailing "wheel nut".
  ["steering wheel", "steering wheel nut", "wheel hub nut"],

  // --- body / interior --------------------------------------------------
  ["seat belt", "seatbelt", "safety belt", "belt anchor", "retractor"],
  ["bumper", "fascia", "bumper cover"],
  ["fender", "wing", "quarter panel"],
  ["hood", "bonnet"],
  ["trunk", "boot", "rear compartment", "hatch"],
  ["headlight", "headlamp", "head lamp"],
  ["taillight", "taillamp", "tail lamp", "rear lamp"],
  ["mirror", "outside mirror", "side mirror"],
  ["windshield", "windscreen"],
  ["roof panel", "targa top", "targa panel", "roof"],
  ["door", "door panel"],
  ["seat", "seat frame", "seat track"],
  ["radiator", "rad"],
  ["fan", "cooling fan", "fan blade"],
  ["surge tank", "expansion tank", "coolant tank", "reservoir"],
  ["battery", "battery cable", "battery tray"],

  // --- position words ---------------------------------------------------
  // Users say "bottom"; GM writes "Lower". These are ALSO consumed by
  // position.ts for the hard gate, but the gate and retrieval are separate
  // concerns: without them here, "rear sway bar bottom bolt" never reaches
  // "Stabilizer Shaft Insulator (Lower) Clamp Nut" at all, because no token
  // in the query matches any token in the record.
  ["lower", "bottom", "underneath", "beneath"],
  ["upper", "top", "uppermost"],
  ["front", "forward", "fwd"],
  ["rear", "back", "rearward", "aft"],
  ["inner", "inboard", "inside"],
  ["outer", "outboard", "outside"],
  ["left", "lh", "driver", "drivers"],
  ["right", "rh", "passenger", "passengers"],
];

/** Generic fastener words. These carry almost no identifying information,
 *  so they are down-weighted rather than dropped — "nut" vs "bolt" does
 *  occasionally disambiguate two fasteners on the same part.
 *
 *  Note what is deliberately NOT here: bracket, mounting, clamp, retainer.
 *  Those look generic but are strongly discriminative in GM's naming — a
 *  "Brake Caliper Mounting Bracket Bolt" and a "Brake Caliper Bleed Screw"
 *  are told apart almost entirely by "mounting bracket". Down-weighting them
 *  made the bleed screw outrank the bracket bolt for "brake caliper bracket". */
export const GENERIC_TERMS = new Set([
  "bolt", "bolts", "nut", "nuts", "screw", "screws", "stud", "studs",
  "fastener", "fasteners", "washer", "assembly", "assm",
]);

/** Words that add nothing to matching.
 *
 *  Includes vague locational filler ("near", "thing", "somewhere") because GM
 *  genuinely uses "near" in fastener names ("Clip Bolt - near the Oil Pan"),
 *  so leaving it in let "that bolt near the thing" score 0.56 against a real
 *  record instead of falling through to not-found. */
export const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "for", "on", "in", "at", "my", "is", "it",
  "what", "whats", "what's", "how", "much", "do", "does", "i", "need", "and",
  "be", "should", "torque", "torqued", "spec", "specs", "specification",
  "specifications", "value", "setting", "tighten", "tightening", "ft", "lb",
  "lbs", "nm", "pound", "pounds", "foot", "feet", "please", "me", "tell",
  "about", "with", "this", "that", "car", "vehicle",
  "near", "nearby", "beside", "next", "thing", "things", "stuff", "something",
  "somewhere", "around", "goes", "go", "get", "got", "its", "there", "here",
]);

/** word -> set of equivalent phrases, built once. */
const INDEX = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const bucket = INDEX.get(term) ?? new Set<string>();
    for (const other of group) bucket.add(other);
    INDEX.set(term, bucket);
  }
}

/** Longest phrases first, so "sway bar link" wins over "sway bar". */
const PHRASES = [...INDEX.keys()].sort((a, b) => b.length - a.length);

/** Every individual word appearing in any synonym group.
 *
 *  Used by the unknown-vocabulary gate to tell apart two very different cases:
 *  a word this project has never heard of (a part the car may not have), and a
 *  word the project understands but GM never prints. "bottom" is the second
 *  kind — the manual always says "Lower" — and treating it as unknown made
 *  "rear shock bottom bolt" abstain despite a clean, unambiguous winner. */
export const KNOWN_VOCABULARY = new Set<string>(
  SYNONYM_GROUPS.flat().flatMap((phrase) => phrase.split(/\s+/)),
);

/** True when we can translate this word even if the source never uses it. */
export function isKnownVocabulary(word: string): boolean {
  return KNOWN_VOCABULARY.has(word) || GENERIC_TERMS.has(word) || STOPWORDS.has(word);
}

/**
 * Expand a query string into the set of phrases it could equivalently be.
 * Returns the matched canonical phrases, not a rewritten string, so the
 * caller can weight original terms above expansions.
 */
export function expandPhrases(text: string): { matched: string[]; expansions: string[] } {
  const hay = ` ${text.toLowerCase()} `;
  const matched: string[] = [];
  const expansions = new Set<string>();
  const consumed: Array<[number, number]> = [];

  for (const phrase of PHRASES) {
    const needle = ` ${phrase} `;
    const at = hay.indexOf(needle);
    if (at === -1) continue;
    // Reject any OVERLAP with an already-claimed span, not merely containment.
    //
    // Containment-only was a real bug: in "steering wheel nut", the longer
    // phrase "steering wheel" claims its span first, but "wheel nut" only
    // partially overlaps it, so it matched too — pulling in the entire lug-nut
    // vocabulary and making the lug-nut record outrank the steering wheel nut.
    // Since PHRASES is sorted longest-first, rejecting overlaps gives correct
    // longest-match-wins behaviour.
    const span: [number, number] = [at, at + needle.length];
    const overlaps = consumed.some(([s, e]) => span[0] < e - 1 && s < span[1] - 1);
    if (overlaps) continue;
    consumed.push(span);
    matched.push(phrase);
    for (const alt of INDEX.get(phrase)!) if (alt !== phrase) expansions.add(alt);
  }
  return { matched, expansions: [...expansions] };
}
