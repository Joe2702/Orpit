// Who a payment was to, and what kind of spending it was.
//
// Card networks and banks name a shop the way their terminal was set up:
// "POS CARREFOUR MAADI 0042 CAIRO EG", "UBER *TRIP HELP.UBER.COM". People call
// it Carrefour and Uber. This file turns the first into the second, and from
// the name decides a category, so an imported payment lands where the person
// would have put it themselves.
//
// The category it picks is a canonical one ("Groceries", "Eating out"), then
// matched to a category the user actually has — "Food" if they never split
// groceries out. A payment filed under a category that appears nowhere else in
// their app is worse than one filed under a slightly broader one.

export type Canon =
  | 'Groceries'
  | 'Eating out'
  | 'Coffee'
  | 'Transport'
  | 'Fuel'
  | 'Bills'
  | 'Subscriptions'
  | 'Health'
  | 'Fitness'
  | 'Shopping'
  | 'Entertainment'
  | 'Travel'
  | 'Education'
  | 'Cash'
  | 'Transfers'
  | 'Fees'
  | 'Salary'
  | 'Income'
  | 'Other';

interface Brand {
  re: RegExp;
  name: string;
  cat: Canon;
}

// Matched against the upper-cased merchant text. Egyptian names first, since
// that is where the app's bank messages come from, then the usual globals.
const BRANDS: Brand[] = [
  // Groceries
  { re: /CARREFOUR|كارفور/u, name: 'Carrefour', cat: 'Groceries' },
  { re: /SPINNEY|سبينيس/u, name: 'Spinneys', cat: 'Groceries' },
  { re: /SEOUDI|سعودي ماركت/u, name: 'Seoudi', cat: 'Groceries' },
  { re: /GOURMET/, name: 'Gourmet', cat: 'Groceries' },
  { re: /KAZYON|كازيون/u, name: 'Kazyon', cat: 'Groceries' },
  { re: /METRO MARKET|METRO MKT/, name: 'Metro Market', cat: 'Groceries' },
  { re: /OSCAR GRAND|OSCAR STORES/, name: 'Oscar', cat: 'Groceries' },
  { re: /HYPER ?ONE/, name: 'HyperOne', cat: 'Groceries' },
  { re: /KHEIR ZAMAN|خير زمان/u, name: 'Kheir Zaman', cat: 'Groceries' },
  { re: /LULU/, name: 'Lulu', cat: 'Groceries' },
  { re: /BREADFAST/, name: 'Breadfast', cat: 'Groceries' },
  { re: /INSTASHOP/, name: 'Instashop', cat: 'Groceries' },
  { re: /\bRABBIT\b/, name: 'Rabbit', cat: 'Groceries' },
  { re: /TALABAT MART/, name: 'Talabat Mart', cat: 'Groceries' },
  { re: /\bBIM\b/, name: 'BIM', cat: 'Groceries' },
  // Eating out and coffee
  { re: /TALABAT|طلبات/u, name: 'Talabat', cat: 'Eating out' },
  { re: /ELMENUS|EL MENUS/, name: 'elmenus', cat: 'Eating out' },
  { re: /OTLOB/, name: 'Otlob', cat: 'Eating out' },
  { re: /MCDONALD/, name: "McDonald's", cat: 'Eating out' },
  { re: /\bKFC\b/, name: 'KFC', cat: 'Eating out' },
  { re: /HARDEE/, name: "Hardee's", cat: 'Eating out' },
  { re: /BURGER KING/, name: 'Burger King', cat: 'Eating out' },
  { re: /BUFFALO BURGER/, name: 'Buffalo Burger', cat: 'Eating out' },
  { re: /PIZZA HUT/, name: 'Pizza Hut', cat: 'Eating out' },
  { re: /DOMINO/, name: "Domino's", cat: 'Eating out' },
  { re: /PAPA JOHN/, name: "Papa John's", cat: 'Eating out' },
  { re: /\bZOOBA\b/, name: 'Zooba', cat: 'Eating out' },
  { re: /ABOU TAREK|ABU TAREK/, name: 'Abou Tarek', cat: 'Eating out' },
  { re: /\bGAD\b/, name: 'Gad', cat: 'Eating out' },
  { re: /SUBWAY/, name: 'Subway', cat: 'Eating out' },
  { re: /SHAKE SHACK/, name: 'Shake Shack', cat: 'Eating out' },
  { re: /\bTBS\b/, name: 'TBS', cat: 'Eating out' },
  { re: /STARBUCKS/, name: 'Starbucks', cat: 'Coffee' },
  { re: /COSTA/, name: 'Costa', cat: 'Coffee' },
  { re: /CILANTRO/, name: 'Cilantro', cat: 'Coffee' },
  { re: /TIM HORTON/, name: 'Tim Hortons', cat: 'Coffee' },
  { re: /DUNKIN/, name: "Dunkin'", cat: 'Coffee' },
  { re: /BEANO/, name: "Beano's", cat: 'Coffee' },
  // Getting around
  { re: /UBER|اوبر/u, name: 'Uber', cat: 'Transport' },
  { re: /CAREEM|كريم/u, name: 'Careem', cat: 'Transport' },
  { re: /SWVL/, name: 'Swvl', cat: 'Transport' },
  { re: /INDRIVE/, name: 'inDrive', cat: 'Transport' },
  { re: /\bDIDI\b/, name: 'DiDi', cat: 'Transport' },
  { re: /CHILL ?OUT/, name: 'Chillout', cat: 'Fuel' },
  { re: /\bMOBIL\b/, name: 'Mobil', cat: 'Fuel' },
  { re: /TOTAL ?ENERG|\bTOTAL\b/, name: 'TotalEnergies', cat: 'Fuel' },
  { re: /WATANI?A/, name: 'Wataniya', cat: 'Fuel' },
  { re: /EMARAT MISR/, name: 'Emarat Misr', cat: 'Fuel' },
  { re: /MISR PETROLEUM/, name: 'Misr Petroleum', cat: 'Fuel' },
  { re: /\bSHELL\b/, name: 'Shell', cat: 'Fuel' },
  { re: /EGYPTAIR/, name: 'EgyptAir', cat: 'Travel' },
  { re: /BOOKING\.COM/, name: 'Booking.com', cat: 'Travel' },
  { re: /AIRBNB/, name: 'Airbnb', cat: 'Travel' },
  { re: /AGODA/, name: 'Agoda', cat: 'Travel' },
  // Bills
  { re: /VODAFONE|فودافون/u, name: 'Vodafone', cat: 'Bills' },
  { re: /ORANGE|اورنج/u, name: 'Orange', cat: 'Bills' },
  { re: /ETISALAT|\bE&|اتصالات/u, name: 'e&', cat: 'Bills' },
  { re: /TE ?DATA|\bWE\b/, name: 'WE', cat: 'Bills' },
  { re: /FAWRY|فوري/u, name: 'Fawry', cat: 'Bills' },
  { re: /ELECTRICITY|كهرباء/u, name: 'Electricity', cat: 'Bills' },
  { re: /NATURAL GAS|TOWN GAS|PETROTRADE/, name: 'Gas', cat: 'Bills' },
  { re: /WATER (?:BILL|COMPANY)/, name: 'Water', cat: 'Bills' },
  // Subscriptions
  { re: /NETFLIX|نتفليكس/u, name: 'Netflix', cat: 'Subscriptions' },
  { re: /SPOTIFY/, name: 'Spotify', cat: 'Subscriptions' },
  { re: /ANGHAMI/, name: 'Anghami', cat: 'Subscriptions' },
  { re: /SHAHID|شاهد/u, name: 'Shahid', cat: 'Subscriptions' },
  { re: /\bOSN\b/, name: 'OSN+', cat: 'Subscriptions' },
  { re: /WATCH ?IT/, name: 'Watch It', cat: 'Subscriptions' },
  { re: /APPLE\.COM|ITUNES|\bAPPLE\b/, name: 'Apple', cat: 'Subscriptions' },
  { re: /GOOGLE/, name: 'Google', cat: 'Subscriptions' },
  { re: /YOUTUBE/, name: 'YouTube', cat: 'Subscriptions' },
  { re: /MICROSOFT|XBOX/, name: 'Microsoft', cat: 'Subscriptions' },
  { re: /ADOBE/, name: 'Adobe', cat: 'Subscriptions' },
  { re: /OPENAI|CHATGPT/, name: 'OpenAI', cat: 'Subscriptions' },
  { re: /ANTHROPIC|CLAUDE\.AI/, name: 'Anthropic', cat: 'Subscriptions' },
  { re: /PLAYSTATION|\bPSN\b|SONY/, name: 'PlayStation', cat: 'Subscriptions' },
  { re: /STEAM/, name: 'Steam', cat: 'Subscriptions' },
  // Health and fitness
  { re: /EL ?EZABY|العزبي/u, name: 'El Ezaby', cat: 'Health' },
  { re: /\bSEIF\b/, name: 'Seif', cat: 'Health' },
  { re: /ROSHDY/, name: 'Roshdy', cat: 'Health' },
  { re: /19011/, name: '19011', cat: 'Health' },
  { re: /AL ?BORG|ALBORG/, name: 'Al Borg', cat: 'Health' },
  { re: /MOKHTABAR/, name: 'Al Mokhtabar', cat: 'Health' },
  { re: /VEZEETA/, name: 'Vezeeta', cat: 'Health' },
  { re: /GOLD'?S GYM/, name: "Gold's Gym", cat: 'Fitness' },
  { re: /SAMIA ALLOUBA/, name: 'Samia Allouba', cat: 'Fitness' },
  // Shopping
  { re: /AMAZON|امازون/u, name: 'Amazon', cat: 'Shopping' },
  { re: /\bNOON\b|نون/u, name: 'noon', cat: 'Shopping' },
  { re: /JUMIA|جوميا/u, name: 'Jumia', cat: 'Shopping' },
  { re: /\bZARA\b/, name: 'Zara', cat: 'Shopping' },
  { re: /H ?& ?M\b/, name: 'H&M', cat: 'Shopping' },
  { re: /DEFACTO/, name: 'DeFacto', cat: 'Shopping' },
  { re: /LC ?WAIKIKI/, name: 'LC Waikiki', cat: 'Shopping' },
  { re: /\bIKEA\b/, name: 'IKEA', cat: 'Shopping' },
  { re: /B\.? ?TECH/, name: 'B.TECH', cat: 'Shopping' },
  { re: /\b2B\b/, name: '2B', cat: 'Shopping' },
  { re: /TRADELINE/, name: 'Tradeline', cat: 'Shopping' },
  { re: /DECATHLON/, name: 'Decathlon', cat: 'Shopping' },
  { re: /SHEIN/, name: 'Shein', cat: 'Shopping' },
  { re: /TEMU/, name: 'Temu', cat: 'Shopping' },
  { re: /ALIEXPRESS/, name: 'AliExpress', cat: 'Shopping' },
  // Out and about
  { re: /\bVOX\b|NOVO CINEMA|CINEMA|سينما/u, name: 'Cinema', cat: 'Entertainment' },
  { re: /TICKETSMARCHE|TIKETS/, name: 'Tickets', cat: 'Entertainment' },
  // Learning
  { re: /UDEMY/, name: 'Udemy', cat: 'Education' },
  { re: /COURSERA/, name: 'Coursera', cat: 'Education' },
];

// What's left when no brand matches: a word in the name that says what it is.
const KEYWORDS: [RegExp, Canon][] = [
  [/SUPERMARKET|HYPERMARKET|MARKET|GROCER|بقال|ماركت|هايبر/u, 'Groceries'],
  [/RESTAURANT|BURGER|PIZZA|GRILL|KITCHEN|BAKERY|FOOD|مطعم|مخبز/u, 'Eating out'],
  [/CAFE|COFFEE|ROAST|كافيه|قهوه/u, 'Coffee'],
  [/TAXI|LIMOUSINE|PARKING|TRANSPORT|METRO|RAILWAY|تاكسي|مترو/u, 'Transport'],
  [/PETROL|FUEL|GAS STATION|بنزين|وقود/u, 'Fuel'],
  [/PHARMAC|HOSPITAL|CLINIC|\bLAB\b|MEDICAL|DENTAL|DOCTOR|صيدلي|مستشف|عياد|معمل/u, 'Health'],
  [/\bGYM\b|FITNESS|PADEL|SPORT|جيم/u, 'Fitness'],
  [/MALL|STORE|SHOP|BOUTIQUE|FASHION/, 'Shopping'],
  [/SUBSCRIPTION|PREMIUM|MEMBERSHIP/, 'Subscriptions'],
  [/HOTEL|RESORT|AIRLINE|AIRWAYS|TRAVEL/, 'Travel'],
  [/UNIVERSITY|SCHOOL|ACADEMY|COURSE|جامعه|مدرسه/u, 'Education'],
  [/BILL|RECHARGE|TOP ?UP|INTERNET|فاتوره|شحن/u, 'Bills'],
];

// Where a terminal name says where the shop is. It's noise in a ledger.
const PLACES =
  /\s+(?:CAIRO|GIZA|ALEX(?:ANDRIA)?|NEW CAIRO|NASR CITY|MAADI|ZAMALEK|HELIOPOLIS|DOKKI|MOHANDESSIN|6TH OF OCTOBER|6 OCTOBER|OCTOBER|SHEIKH ZAYED|ZAYED|TAGAMOA|EL ?REHAB|MADINATY|SHOROUK|HURGHADA|SHARM|EGY?|EGYPT|EG)\b.*$/i;

/**
 * Names the importer gives a payment when the message didn't say who it was
 * to ("Money sent", "Card payment"). Not places: they don't belong in a list
 * of where the money went, or in anything learned about a shop.
 */
export const isGenericName = (name: string): boolean =>
  /^(?:Money (?:sent|received|in)|Card payment|Cash withdrawal|Transfer|Transfer fee|Refund|Bank)$/i.test(name.trim());

/** Every way of spelling a shop collapses to one key, for learning and grouping. */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 40);
}

export function findBrand(text: string): Brand | null {
  const u = text.toUpperCase();
  return BRANDS.find((b) => b.re.test(u)) || null;
}

/**
 * A readable name for whoever was paid.
 *
 * A known brand gets its own spelling. Anything else loses the parts that are
 * about the terminal rather than the shop: "POS", a store number, the city, a
 * payment processor's prefix.
 */
export function cleanMerchant(raw: string, context = ''): string {
  const brand = findBrand(raw) || (context ? findBrand(context) : null);
  if (brand) return brand.name;
  let s = raw.trim();
  s = s.replace(/^(?:POS|PURCHASE|PAYMENT|ONLINE|ECOM|E-COM|WWW\.)\s*[-:*]?\s*/i, '');
  s = s.replace(/^(?:PAYPAL|PAYMOB|SQ|SP|TST|PAYTABS)\s*\*\s*/i, '');
  // What follows a star is the processor's descriptor ("SHOP *ORDER 1234").
  if (!s.startsWith('*')) s = s.replace(/\s*\*.*$/, '');
  s = s.replace(PLACES, '');
  s = s.replace(/\s+#?\d{2,}\b.*$/, '');
  s = s.replace(/[.,;:*_|\-]+$/, '').trim();
  return s || raw.trim();
}

/** What kind of spending a name is, before matching it to the user's own categories. */
export function canonicalFor(name: string, opts: { income: boolean; refund?: boolean; atm?: boolean; transfer?: boolean; salary?: boolean }): Canon {
  if (opts.income) return opts.salary ? 'Salary' : 'Income';
  if (opts.atm) return 'Cash';
  const brand = findBrand(name);
  if (brand) return brand.cat;
  const u = name.toUpperCase();
  for (const [re, cat] of KEYWORDS) if (re.test(u)) return cat;
  // Money sent to a person by InstaPay or a wallet is not shopping.
  if (opts.transfer) return 'Transfers';
  return 'Other';
}

// The user's categories that can stand in for each canonical one, best first.
const SYNONYMS: Record<Canon, string[]> = {
  Groceries: ['Groceries', 'Grocery', 'Supermarket', 'Food'],
  'Eating out': ['Eating out', 'Restaurants', 'Dining', 'Food', 'Food & drink'],
  Coffee: ['Coffee', 'Cafe', 'Eating out', 'Food'],
  Transport: ['Transport', 'Transportation', 'Car', 'Travel'],
  Fuel: ['Fuel', 'Car', 'Transport'],
  Bills: ['Bills', 'Utilities'],
  // Not "Fun": a subscription is the spending people most want to see on its
  // own, and folded into a broad category it can't be found.
  Subscriptions: ['Subscriptions'],
  Health: ['Health', 'Medical'],
  Fitness: ['Fitness', 'Sport', 'Gym', 'Health'],
  Shopping: ['Shopping'],
  Entertainment: ['Entertainment', 'Fun'],
  Travel: ['Travel', 'Holidays'],
  Education: ['Education', 'Learning'],
  Cash: ['Cash'],
  Transfers: ['Transfers', 'Sent'],
  Fees: ['Fees', 'Bank fees', 'Charges'],
  Salary: ['Salary', 'Income'],
  Income: ['Income', 'Other'],
  Other: ['Other', 'General'],
};

/**
 * The user's own category for a canonical one.
 *
 * Falls back to the canonical name itself, which the server creates on first
 * use. That only happens for the short list in CREATABLE; it is better than
 * filing every phone bill under "Other" for a user who simply never made a
 * Bills category.
 */
export function categoryFor(canon: Canon, userCats: string[]): string {
  const have = new Map(userCats.map((c) => [c.toLowerCase(), c]));
  for (const s of SYNONYMS[canon]) {
    const hit = have.get(s.toLowerCase());
    if (hit) return hit;
  }
  return canon;
}

/** Categories the import may create, with how they look. Mirrored on the server. */
export const CREATABLE: Record<string, { icon: string; kind: 'expense' | 'income' }> = {
  Groceries: { icon: 'cart', kind: 'expense' },
  'Eating out': { icon: 'food', kind: 'expense' },
  Coffee: { icon: 'coffee', kind: 'expense' },
  Fuel: { icon: 'car', kind: 'expense' },
  Bills: { icon: 'bolt', kind: 'expense' },
  Subscriptions: { icon: 'repeat', kind: 'expense' },
  Fitness: { icon: 'heart', kind: 'expense' },
  Travel: { icon: 'star', kind: 'expense' },
  Education: { icon: 'laptop', kind: 'expense' },
  Cash: { icon: 'cash', kind: 'expense' },
  Transfers: { icon: 'repeat', kind: 'expense' },
  Fees: { icon: 'other', kind: 'expense' },
  Income: { icon: 'cash', kind: 'income' },
};

// ---------------------------------------------------------------------------
// Who sent the message

const WALLET_SENDERS = /VODAFONE ?CASH|VF-?CASH|ORANGE ?(?:CASH|MONEY)|ETISALAT ?CASH|E& ?(?:CASH|MONEY)|WE ?PAY|CIB ?SMART|MEEZA|VALU|SYMPL|TELDA|KHAZNA|INSTAPAY/i;

const BANK_NAMES: [RegExp, string][] = [
  [/^CIB|COMMERCIAL INTL/i, 'CIB'],
  [/^NBE|AHLY|^NATIONAL ?BANK/i, 'NBE'],
  [/BANQUE ?MISR|^BM\b|MISR ?BANK/i, 'Banque Misr'],
  [/^QNB/i, 'QNB'],
  [/^HSBC/i, 'HSBC'],
  [/^AAIB|ARAB AFRICAN/i, 'AAIB'],
  [/^ADIB/i, 'ADIB'],
  [/^ALEX ?BANK/i, 'AlexBank'],
  [/^FAB\b|FIRST ABU/i, 'FAB'],
  [/^EG ?BANK/i, 'EG Bank'],
  [/^BANQUE ?DU ?CAIRE|^BDC/i, 'Banque du Caire'],
  [/^EMIRATES ?NBD|^ENBD/i, 'Emirates NBD'],
  [/^MASHREQ/i, 'Mashreq'],
  [/^ATTIJARI/i, 'Attijariwafa'],
  [/^SAIB/i, 'SAIB'],
  [/^HDB|HOUSING ?DEV/i, 'HDB'],
  [/^ABK/i, 'ABK'],
  [/^NBK/i, 'NBK'],
  [/^CREDIT ?AGRICOLE|^CAE\b/i, 'Crédit Agricole'],
  [/^TELDA/i, 'Telda'],
  [/^VALU/i, 'valU'],
  [/VODAFONE ?CASH|VF-?CASH/i, 'Vodafone Cash'],
  [/ORANGE ?(?:CASH|MONEY)/i, 'Orange Cash'],
  [/ETISALAT ?CASH|E& ?(?:CASH|MONEY)/i, 'e& Cash'],
  [/WE ?PAY/i, 'WE Pay'],
  [/INSTAPAY/i, 'InstaPay'],
];

/** A short, recognisable name for whoever sent a bank message. */
export function senderName(sender: string): string {
  const s = sender.trim();
  for (const [re, name] of BANK_NAMES) if (re.test(s)) return name;
  // Sender ids are short and upper-case: "MISRBANK", "Bank-ABC". Tidy, don't invent.
  return s.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Bank';
}

export type Instrument = 'credit' | 'wallet' | 'card' | 'account';

/** What kind of account a message is about, for naming the account it creates. */
export function accountType(sender: string, instrument: Instrument | null): string {
  if (instrument === 'credit') return 'Credit card';
  if (instrument === 'wallet' || WALLET_SENDERS.test(sender)) return 'Wallet';
  return 'Bank';
}

/** The account a message belongs to, as the server matches it: who sent it and which card. */
export interface AccountLink {
  sender: string;
  card: string | null;
  /** Used only when the account has to be created. */
  label: string;
  type: string;
}

export function linkFor(sender: string, card: string | null, instrument: Instrument | null): AccountLink {
  const name = senderName(sender);
  const type = accountType(sender, instrument);
  return {
    sender: name,
    card,
    // A bank's debit cards and accounts all land in one account, so it is
    // named for the bank. A credit card is its own, and named for the card.
    label: type === 'Credit card' ? `${name} card${card ? ` ••${card}` : ''}` : name,
    type,
  };
}
