/** Position in 3D political space. Each axis: [-1, +1]. */
export interface PoliticalVector {
    readonly social: number;
    readonly economic: number;
    readonly populist: number;
}
/** Distance thresholds for echo-chamber classification (PRD Appendix A). */
export interface ThresholdConfig {
    readonly echoChamber: number;
    readonly mildBias: number;
    readonly diverseExposure: number;
}
export type InterventionLevel = "none" | "low" | "medium" | "critical";
export type DriftDirection = "toward" | "away";
/** Supported BYOK providers for Phase 2 analysis. */
export type ByokProvider = "openai" | "anthropic" | "google";
/** Phase 1 analysis result: lightweight, quota-free, cached globally by tweetId. */
export interface Phase1Analysis {
    readonly tweetVector: PoliticalVector;
    readonly fallacies: readonly string[];
    readonly topic: string;
    readonly confidence: number;
}
/** Phase 2 analysis result: expensive socratic content, cached per-user. */
export interface Phase2Analysis {
    readonly counterArgument: string;
    readonly logicFailure: string;
    readonly claim: string;
    readonly mechanism: string;
    readonly dataCheck: string;
    readonly socraticChallenge: string;
}
/** Full analysis combining Phase 1 and Phase 2 results. */
export interface FullAnalysis extends Phase1Analysis {
    readonly phase2?: Phase2Analysis;
    readonly analyzedAt: number;
    readonly expiresAt: number;
}
/** Quota status for authenticated user. */
export interface QuotaStatus {
    readonly used: number;
    readonly limit: number;
    readonly remaining: number;
    readonly resetsAt: string;
    readonly hasOwnKey: boolean;
}
/** Request payload for Phase 2 analysis. */
export interface Phase2Request {
    readonly tweetId: string;
    readonly tweetText: string;
    readonly phase1Result: Phase1Analysis;
    readonly provider?: ByokProvider;
    readonly apiKey?: string;
}
/** Error response when quota is exhausted. */
export interface QuotaExhaustedError {
    readonly code: "QUOTA_EXHAUSTED";
    readonly message: string;
    readonly quota: Omit<QuotaStatus, "hasOwnKey">;
}
/** API response wrapper for Phase 2. */
export type Phase2Response = {
    readonly success: true;
    readonly analysis: Phase2Analysis;
} | {
    readonly success: false;
    readonly error: QuotaExhaustedError | {
        readonly code: string;
        readonly message: string;
    };
};
//# sourceMappingURL=types.d.ts.map