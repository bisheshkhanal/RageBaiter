export const MAX_QUESTION_LENGTH = 280;

export const BLOCKED_RESPONSE = "[Content blocked: unsafe output detected]";

const FALLACY_TEMPLATES: Record<string, readonly string[]> = {
  "ad hominem": [
    "What if we set aside personal attacks — does the core argument still hold up on its own merits?",
    "If someone you respected made this same argument, would you evaluate it differently?",
    "Can you separate the person making the claim from the claim itself?",
  ],
  strawman: [
    "Is this a fair representation of the opposing view, or has it been simplified?",
    "What would the other side say their actual position is?",
    "Could restating the original argument more accurately change your perspective?",
  ],
  "false dilemma": [
    "Are these really the only two options, or could there be a middle ground?",
    "What other possibilities might exist beyond the ones presented here?",
    "Is it possible that both options contain some truth?",
  ],
  "appeal to authority": [
    "Does this authority have relevant expertise in this specific area?",
    "What evidence supports this claim beyond the authority's endorsement?",
    "Could equally credible experts hold a different view on this?",
  ],
  "hasty generalization": [
    "Is this conclusion based on enough examples to be reliable?",
    "Could there be cases that contradict this generalization?",
    "What would a larger sample of evidence reveal about this claim?",
  ],
  "slippery slope": [
    "Is each step in this chain of events actually likely to happen?",
    "What evidence supports the idea that one event will inevitably lead to the next?",
    "Are there safeguards or factors that could prevent this chain reaction?",
  ],
  "red herring": [
    "How does this point connect to the original topic being discussed?",
    "Could this be diverting attention from the main issue?",
    "What was the original question, and has it been answered?",
  ],
  "appeal to emotion": [
    "Setting emotions aside for a moment, what does the evidence actually show?",
    "Is this argument relying more on feelings than facts?",
    "Would this claim be as persuasive without the emotional framing?",
  ],
  bandwagon: [
    "Does the popularity of this belief make it more likely to be true?",
    "Have there been times when the majority opinion turned out to be wrong?",
    "What evidence exists independent of how many people believe this?",
  ],
  whataboutism: [
    "Does pointing to another issue actually address the original concern?",
    "Can both issues be problematic at the same time?",
    "What if we focused on evaluating this specific claim on its own?",
  ],
  "tu quoque": [
    "Even if the speaker is inconsistent, could their argument still be valid?",
    "Does someone's past behavior change whether their current point is correct?",
    "Can we evaluate this claim independently of who is making it?",
  ],
  "loaded question": [
    "Does this question contain a hidden assumption that should be examined first?",
    "What would happen if we challenged the premise built into this question?",
    "Is there a way to reframe this question without the embedded assumption?",
  ],
};

const GENERIC_TEMPLATES: readonly string[] = [
  "What evidence would change your mind about this?",
  "How might someone with a different perspective view this claim?",
  "What assumptions does this argument rely on?",
];

// Security: regex patterns for slurs, threats, explicit content, dehumanization, self-harm
const OFFENSIVE_PATTERNS: readonly RegExp[] = [
  /\b(?:n[i1]gg|f[a@]gg?[o0]t|k[i1]ke|sp[i1]c|ch[i1]nk|w[e3]tb[a@]ck|r[e3]t[a@]rd)\w*/i,
  /\b(?:kill\s+(?:you|them|all)|murder\s+(?:you|them)|shoot\s+(?:you|them)|bomb\s+(?:you|them))\b/i,
  /\b(?:rape|molest|pedo(?:phile)?)\b/i,
  /\b(?:subhuman|vermin|cockroach(?:es)?|animals?\s+(?:that|who)\s+(?:should|need|deserve))\b/i,
  /\b(?:kill\s+yourself|kys|go\s+die)\b/i,
];

export const normalizeFallacyName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

export const containsOffensiveContent = (text: string): boolean =>
  OFFENSIVE_PATTERNS.some((pattern) => pattern.test(text));

export const truncateQuestion = (text: string, maxLength: number = MAX_QUESTION_LENGTH): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const limit = maxLength - 3;
  if (limit <= 0) {
    return text.slice(0, maxLength);
  }

  const truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  const breakPoint = lastSpace > 0 ? lastSpace : limit;
  return truncated.slice(0, breakPoint) + "...";
};

const GENERIC_FALLBACK = "What evidence would change your mind about this?";

export const selectFallbackTemplate = (fallacy: string, index: number = 0): string => {
  const normalized = normalizeFallacyName(fallacy);
  const templates = FALLACY_TEMPLATES[normalized] ?? GENERIC_TEMPLATES;
  const safeIndex = Math.abs(index) % templates.length;
  return templates[safeIndex] ?? GENERIC_FALLBACK;
};

export type SocraticQuestionInput = {
  readonly fallacy: string;
  readonly topic?: string | undefined;
  readonly templateIndex?: number | undefined;
};

export type SocraticQuestionResult = {
  readonly question: string;
  readonly fallacyNormalized: string;
  readonly usedFallacyTemplate: boolean;
  readonly wasTruncated: boolean;
  readonly wasBlocked: boolean;
};

export const generateSocraticQuestion = (input: SocraticQuestionInput): SocraticQuestionResult => {
  const normalized = normalizeFallacyName(input.fallacy);
  const hasFallacyTemplate = normalized in FALLACY_TEMPLATES;
  const template = selectFallbackTemplate(input.fallacy, input.templateIndex ?? 0);

  let question: string = input.topic ? `Regarding "${input.topic}": ${template}` : template;

  if (containsOffensiveContent(question)) {
    return {
      question: BLOCKED_RESPONSE,
      fallacyNormalized: normalized,
      usedFallacyTemplate: hasFallacyTemplate,
      wasTruncated: false,
      wasBlocked: true,
    };
  }

  const truncated = truncateQuestion(question);
  const wasTruncated = truncated.length < question.length;
  question = truncated;

  return {
    question,
    fallacyNormalized: normalized,
    usedFallacyTemplate: hasFallacyTemplate,
    wasTruncated,
    wasBlocked: false,
  };
};

export const generateQuestionsForFallacies = (
  fallacies: readonly string[],
  topic?: string | undefined
): readonly SocraticQuestionResult[] =>
  fallacies.map((fallacy, index) =>
    generateSocraticQuestion({ fallacy, topic, templateIndex: index })
  );

export const getKnownFallacies = (): readonly string[] => Object.keys(FALLACY_TEMPLATES);
