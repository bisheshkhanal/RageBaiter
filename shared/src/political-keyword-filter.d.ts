export type PoliticalSensitivity = "low" | "medium" | "high";
export interface PoliticalDetectionResult {
    readonly isPolitical: boolean;
    readonly matchedKeywords: string[];
    readonly confidence: number;
}
export declare const POLITICAL_KEYWORDS: readonly string[];
export declare function isPolitical(text: string, sensitivity?: PoliticalSensitivity): PoliticalDetectionResult;
//# sourceMappingURL=political-keyword-filter.d.ts.map