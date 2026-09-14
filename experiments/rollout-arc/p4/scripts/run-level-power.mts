// How many RUNS would it take to resolve an effect on the prior?
// The gate established that item-level noise is buyable with generation. This asks the
// other question: what is the BETWEEN-RUN spread, and what does it cost to see past it?
const C   = [2.92, 3.27, 1.15];    // item-wise concentration delta vs base, pp
const PIL = [1.04, 4.69, -3.21];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
for (const [n, a] of [["C   (unforced)", C], ["PIL (forced+grad)", PIL]] as const) {
  console.log(`${n}  mean ${mean(a).toFixed(2)}pp  between-run sd ${sd(a).toFixed(2)}pp  runs ${a.map((v) => v.toFixed(2)).join(" / ")}`);
}
console.log(`\nPIL's between-run sd is ${(sd(PIL) / sd(C)).toFixed(1)}x C's -- the intervention inflated run variance.`);
console.log(`\nruns needed at 80% power, two-sided 0.05, using the POOLED between-run sd:`);
const pooled = Math.sqrt((sd(C) ** 2 * 2 + sd(PIL) ** 2 * 2) / 4);
console.log(`  pooled between-run sd ${pooled.toFixed(2)}pp`);
for (const d of [1, 2, 3, 5]) {
  const n = Math.ceil(((1.96 + 0.8416) * pooled / d) ** 2);
  console.log(`  to detect ${d}pp: ${String(n).padStart(3)} runs per arm  (~${(n * 0.5).toFixed(0)}h training + ~${(n * 0.67).toFixed(0)}h eval per arm)`);
}
console.log(`\nFor scale: this session ran 3 runs per arm.`);
