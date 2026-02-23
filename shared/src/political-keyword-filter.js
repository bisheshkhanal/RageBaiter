const SENSITIVITY_THRESHOLDS = {
    low: 10,
    medium: 3,
    high: 1,
};
const OBFUSCATION_MAP = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    $: "s",
    "!": "i",
    "|": "i",
    "*": "",
    "#": "",
};
function applyObfuscationMap(text) {
    let normalized = text;
    for (const [source, target] of Object.entries(OBFUSCATION_MAP)) {
        normalized = normalized.split(source).join(target);
    }
    return normalized;
}
function normalizeText(text) {
    const lowered = text.toLowerCase();
    const deaccented = lowered.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const unobfuscated = applyObfuscationMap(deaccented);
    return unobfuscated
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export const POLITICAL_KEYWORDS = [
    "election",
    "vote",
    "voter",
    "voting",
    "ballot",
    "poll",
    "polling",
    "primary",
    "caucus",
    "runoff",
    "incumbent",
    "campaign",
    "campaigning",
    "campaign trail",
    "candidate",
    "nominee",
    "debate",
    "town hall",
    "swing state",
    "electoral college",
    "popular vote",
    "absentee ballot",
    "mail in ballot",
    "early voting",
    "voter turnout",
    "gerrymander",
    "redistricting",
    "district",
    "precinct",
    "super tuesday",
    "exit poll",
    "election day",
    "midterms",
    "general election",
    "special election",
    "recount",
    "election fraud",
    "voter suppression",
    "voter id",
    "registration",
    "policy",
    "public policy",
    "legislation",
    "lawmaker",
    "bill",
    "act",
    "statute",
    "regulation",
    "executive order",
    "mandate",
    "subsidy",
    "tariff",
    "sanction",
    "tax",
    "taxes",
    "taxation",
    "tax cut",
    "tax hike",
    "budget",
    "deficit",
    "debt ceiling",
    "appropriation",
    "spending bill",
    "stimulus",
    "welfare",
    "medicaid",
    "medicare",
    "social security",
    "minimum wage",
    "labor law",
    "union",
    "collective bargaining",
    "healthcare",
    "single payer",
    "public option",
    "insurance mandate",
    "immigration",
    "border",
    "asylum",
    "deportation",
    "amnesty",
    "citizenship",
    "visa policy",
    "gun control",
    "second amendment",
    "abortion",
    "reproductive rights",
    "climate policy",
    "green new deal",
    "carbon tax",
    "emissions",
    "renewable",
    "fossil fuel",
    "party",
    "partisan",
    "bipartisan",
    "left wing",
    "right wing",
    "centrist",
    "progressive",
    "conservative",
    "liberal",
    "moderate",
    "socialist",
    "democratic socialist",
    "libertarian",
    "populist",
    "nationalist",
    "globalist",
    "republican",
    "democrat",
    "gop",
    "dnc",
    "rnc",
    "tea party",
    "maga",
    "administration",
    "government",
    "state",
    "federal",
    "municipal",
    "governor",
    "mayor",
    "president",
    "vice president",
    "cabinet",
    "congress",
    "senate",
    "senator",
    "house",
    "representative",
    "supreme court",
    "justice",
    "judiciary",
    "court",
    "constitution",
    "constitutional",
    "amendment",
    "checks and balances",
    "separation of powers",
    "filibuster",
    "whip",
    "majority leader",
    "minority leader",
    "speaker",
    "committee",
    "oversight",
    "hearing",
    "impeachment",
    "censure",
    "ethics committee",
    "lobby",
    "lobbyist",
    "pac",
    "super pac",
    "campaign finance",
    "dark money",
    "activism",
    "activist",
    "protest",
    "march",
    "rally",
    "demonstration",
    "civil rights",
    "human rights",
    "justice reform",
    "criminal justice",
    "policing",
    "police reform",
    "defund",
    "grassroots",
    "organizing",
    "petition",
    "boycott",
    "strike",
    "sit in",
    "civil disobedience",
    "advocacy",
    "ngo",
    "foreign policy",
    "geopolitics",
    "diplomacy",
    "treaty",
    "alliance",
    "nato",
    "united nations",
    "un",
    "security council",
    "ceasefire",
    "war",
    "conflict",
    "invasion",
    "occupation",
    "annexation",
    "sovereignty",
    "territorial",
    "military aid",
    "defense budget",
    "national security",
    "intelligence",
    "sanctions",
    "trade deal",
    "arms control",
    "nuclear policy",
    "deterrence",
    "regime",
    "state department",
    "white house",
    "downing street",
    "kremlin",
    "parliament",
    "prime minister",
    "chancellor",
    "monarchy",
    "authoritarian",
    "democracy",
    "democratic",
    "autocracy",
    "dictator",
    "coup",
    "referendum",
    "plebiscite",
    "ideology",
    "propaganda",
    "misinformation",
    "disinformation",
    "censorship",
    "freedom of speech",
    "civil liberty",
    "surveillance",
    "whistleblower",
    "corruption",
    "bribery",
    "nepotism",
    "oligarchy",
    "biden",
    "trump",
    "harris",
    "obama",
    "clinton",
    "bush",
    "reagan",
    "schumer",
    "mcconnell",
    "pelosi",
    "aoc",
    "bernie",
    "desantis",
    "putin",
    "zelensky",
    "xi jinping",
    "modi",
    "netanyahu",
    "erdogan",
    "european union",
    "eu",
    "brexit",
    "article 5",
    "icc",
    "icj",
];
const normalizedKeywordEntries = POLITICAL_KEYWORDS.map((keyword) => {
    const normalized = normalizeText(keyword);
    return [normalized, keyword];
}).filter((entry) => entry[0].length > 0);
const canonicalKeywordMap = new Map(normalizedKeywordEntries);
const normalizedSingleWordKeywords = new Set();
const normalizedPhraseKeywords = [];
const normalizedDevoweledKeywords = new Map();
for (const keyword of canonicalKeywordMap.keys()) {
    if (keyword.includes(" ")) {
        normalizedPhraseKeywords.push(keyword);
        continue;
    }
    normalizedSingleWordKeywords.add(keyword);
    const devoweled = keyword.replace(/[aeiou]/g, "");
    if (devoweled.length >= 3 &&
        devoweled !== keyword &&
        !normalizedDevoweledKeywords.has(devoweled)) {
        normalizedDevoweledKeywords.set(devoweled, canonicalKeywordMap.get(keyword) ?? keyword);
    }
}
function clamp01(value) {
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return value;
}
function computeConfidence(matchCount, tokenCount) {
    if (matchCount === 0 || tokenCount === 0) {
        return 0;
    }
    const density = matchCount / tokenCount;
    return clamp01(density * 8);
}
export function isPolitical(text, sensitivity = "medium") {
    const normalizedText = normalizeText(text);
    if (normalizedText.length === 0) {
        return {
            isPolitical: false,
            matchedKeywords: [],
            confidence: 0,
        };
    }
    const tokens = normalizedText.split(" ").filter((token) => token.length > 0);
    const matched = new Set();
    for (const token of tokens) {
        let canonical = canonicalKeywordMap.get(token);
        if (!canonical && !normalizedSingleWordKeywords.has(token)) {
            canonical = normalizedDevoweledKeywords.get(token);
        }
        if (canonical) {
            matched.add(canonical);
        }
    }
    const paddedText = ` ${normalizedText} `;
    for (const phrase of normalizedPhraseKeywords) {
        if (!paddedText.includes(` ${phrase} `)) {
            continue;
        }
        const canonical = canonicalKeywordMap.get(phrase);
        if (canonical) {
            matched.add(canonical);
        }
    }
    const matchedKeywords = Array.from(matched).sort();
    const matchCount = matchedKeywords.length;
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];
    return {
        isPolitical: matchCount >= threshold,
        matchedKeywords,
        confidence: computeConfidence(matchCount, tokens.length),
    };
}
//# sourceMappingURL=political-keyword-filter.js.map