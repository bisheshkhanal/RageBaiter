import { isPolitical } from "./political-keyword-filter.js";

const BASE_TWEET =
  "Election debate tonight: the president, senate, and congress are arguing over immigration policy, border funding, healthcare reform, climate policy, and a new tax bill. #Election #Vote #Democracy #Policy #Congress #Governance #Legislation #CivicDuty #PublicPolicy";

const SAMPLE_TWEET =
  BASE_TWEET.length >= 280 ? BASE_TWEET.slice(0, 280) : BASE_TWEET.padEnd(280, " ");

const WARMUP_RUNS = 20_000;
const MEASURED_RUNS = 250_000;

for (let i = 0; i < WARMUP_RUNS; i += 1) {
  isPolitical(SAMPLE_TWEET, "medium");
}

const start = performance.now();
for (let i = 0; i < MEASURED_RUNS; i += 1) {
  isPolitical(SAMPLE_TWEET, "medium");
}
const end = performance.now();

const totalMs = end - start;
const meanMs = totalMs / MEASURED_RUNS;

console.log("Task-7 Political Keyword Filter Benchmark");
console.log(`tweet_length_chars=${SAMPLE_TWEET.length}`);
console.log(`iterations=${MEASURED_RUNS}`);
console.log(`total_ms=${totalMs.toFixed(6)}`);
console.log(`mean_ms=${meanMs.toFixed(6)}`);
