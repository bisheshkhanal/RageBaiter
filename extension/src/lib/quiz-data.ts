/**
 * Political Compass Quiz Data
 *
 * 18 questions covering three axes:
 * - Social axis (6 questions): progressive vs traditional values
 * - Economic axis (6 questions): free market vs interventionist
 * - Populist axis (6 questions): anti-elite vs establishment
 *
 * All questions use a 5-point Likert scale:
 * - -1.0: Strongly Disagree
 * - -0.5: Disagree
 *   0.0: Neutral
 *   0.5: Agree
 *   1.0: Strongly Agree
 */

export type QuizAxis = "social" | "economic" | "populist";

export type QuizQuestion = {
  readonly id: number;
  readonly text: string;
  readonly axis: QuizAxis;
  /** If true, the question is inverted (Strongly Agree = -1.0) */
  readonly inverted: boolean;
};

/**
 * 18 deterministic questions covering all three political axes.
 * Questions are politically neutral in framing.
 */
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  // Social Axis (Progressive vs Traditional)
  {
    id: 1,
    text: "Society should be more accepting of diverse family structures.",
    axis: "social",
    inverted: false,
  },
  {
    id: 2,
    text: "Traditional values provide the foundation for a stable society.",
    axis: "social",
    inverted: true, // Inverted: agreeing with traditional = conservative
  },
  {
    id: 3,
    text: "The government should not regulate personal lifestyle choices.",
    axis: "social",
    inverted: false,
  },
  {
    id: 4,
    text: "Cultural institutions should preserve historical practices over modern reforms.",
    axis: "social",
    inverted: true, // Inverted: preserving historical = conservative
  },
  {
    id: 5,
    text: "Individual autonomy in personal decisions is more important than community standards.",
    axis: "social",
    inverted: false,
  },
  {
    id: 6,
    text: "Rapid social change often leads to unintended negative consequences.",
    axis: "social",
    inverted: true, // Inverted: caution about change = conservative
  },

  // Economic Axis (Free Market vs Interventionist)
  {
    id: 7,
    text: "Free markets generally produce better outcomes than government intervention.",
    axis: "economic",
    inverted: true, // Inverted: free market = right/libertarian
  },
  {
    id: 8,
    text: "The government has a responsibility to ensure a basic standard of living for all citizens.",
    axis: "economic",
    inverted: false,
  },
  {
    id: 9,
    text: "Regulations on businesses often create more problems than they solve.",
    axis: "economic",
    inverted: true, // Inverted: anti-regulation = right/libertarian
  },
  {
    id: 10,
    text: "Wealth inequality is one of the most pressing issues facing our society.",
    axis: "economic",
    inverted: false,
  },
  {
    id: 11,
    text: "Private enterprise is more efficient than government-run programs.",
    axis: "economic",
    inverted: true, // Inverted: pro-private = right/libertarian
  },
  {
    id: 12,
    text: "Essential services like healthcare should be publicly funded.",
    axis: "economic",
    inverted: false,
  },

  // Populist Axis (Anti-Elite vs Establishment)
  {
    id: 13,
    text: "Political and economic elites are out of touch with ordinary people.",
    axis: "populist",
    inverted: false,
  },
  {
    id: 14,
    text: "Experts and institutions generally make better decisions than popular opinion.",
    axis: "populist",
    inverted: true, // Inverted: pro-expert = establishment
  },
  {
    id: 15,
    text: "The system is rigged to benefit the wealthy and powerful at the expense of regular people.",
    axis: "populist",
    inverted: false,
  },
  {
    id: 16,
    text: "Complex policy issues require specialized knowledge that the average citizen lacks.",
    axis: "populist",
    inverted: true, // Inverted: specialized knowledge argument = establishment
  },
  {
    id: 17,
    text: "Mainstream media and institutions hide important information from the public.",
    axis: "populist",
    inverted: false,
  },
  {
    id: 18,
    text: "Established political parties serve the interests of donors more than constituents.",
    axis: "populist",
    inverted: false,
  },
] as const;

/** Total number of quiz questions */
export const QUIZ_QUESTION_COUNT = QUIZ_QUESTIONS.length;

/** Questions per axis for validation */
export const QUESTIONS_PER_AXIS = {
  social: 6,
  economic: 6,
  populist: 6,
} as const;

/**
 * Likert scale options displayed to users.
 * Values are normalized to [-1, 1] range.
 */
export const LIKERT_OPTIONS = [
  { label: "Strongly Disagree", value: -1.0 },
  { label: "Disagree", value: -0.5 },
  { label: "Neutral", value: 0.0 },
  { label: "Agree", value: 0.5 },
  { label: "Strongly Agree", value: 1.0 },
] as const;

export type LikertValue = -1.0 | -0.5 | 0.0 | 0.5 | 1.0;

/**
 * Validates that a value is a valid Likert scale value.
 */
export const isValidLikertValue = (value: number): value is LikertValue => {
  return [-1.0, -0.5, 0.0, 0.5, 1.0].includes(value);
};
