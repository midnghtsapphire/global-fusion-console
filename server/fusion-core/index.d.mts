import type { Analysis } from "../../shared/fusion";
export function collectIntelligence(options: { limit: number; advisoryLimit: number }): Promise<Analysis>;
export function buildReport(analysis: Analysis, options: { turn: number }): string;
export function buildSocialDrafts(analysis: Analysis, options: { turn: number }): unknown;
