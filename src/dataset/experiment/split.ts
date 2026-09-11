// ─── Split by the unit that leaks ────────────────────────────────────────────
//
// Records sharing a splitKey must never straddle train/test. The assignment
// (which keys are holdout) is the task's business.

export function assertNoStraddle<T>(
  items: readonly T[],
  splitKey: (c: T) => string,
  splitOf: (c: T) => "train" | "test",
): void {
  const byKey = new Map<string, Set<"train" | "test">>();
  for (const c of items) {
    const key = splitKey(c);
    const side = splitOf(c);
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
    }
    set.add(side);
    if (set.size > 1) {
      throw new Error(
        `splitKey "${key}" straddles train and test. Split by the unit that leaks.`,
      );
    }
  }
}

/**
 * A family whose gold never varies on a split has no gradient. The v1
 * corpus spent a week with five constant-gold families; this is that gate
 * as a function rather than a one-off test.
 */
export function assertGoldVaries<T>(
  items: readonly T[],
  goldOf: (c: T) => string,
  splitOf: (c: T) => "train" | "test",
  familyOf: (c: T) => string = () => "all",
): void {
  for (const side of ["train", "test"] as const) {
    const byFamily = new Map<string, Set<string>>();
    for (const c of items) {
      if (splitOf(c) !== side) continue;
      const f = familyOf(c);
      let set = byFamily.get(f);
      if (!set) {
        set = new Set();
        byFamily.set(f, set);
      }
      set.add(goldOf(c));
    }
    for (const [f, answers] of byFamily) {
      if (answers.size < 2) {
        throw new Error(
          `gold does not vary in ${f} ${side} (${[...answers].join(", ") || "empty"}). A constant label has no gradient.`,
        );
      }
    }
  }
}
