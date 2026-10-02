/**
 * In-process token bucket for the LLM's tokens-per-minute budget (ARCHITECTURE section 12).
 *
 * The point is that a caller WAITS rather than fails: a thorough scan of a 150-page contract
 * fires many calls in a row, and getting a 429 half-way through would turn an honest
 * "read the whole document" into a partial answer. Waiting costs time; failing costs truth.
 *
 * Single-instance only, which is correct here — one Render service, one process. It is a
 * budget guard, not a distributed limiter.
 */
export class TokenBucketLimiter {
  private available: number;
  private lastRefillMs: number;

  constructor(
    private readonly tokensPerMinute: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.available = tokensPerMinute;
    this.lastRefillMs = this.now();
  }

  private refill(): void {
    const nowMs = this.now();
    const elapsedMs = nowMs - this.lastRefillMs;
    if (elapsedMs <= 0) return;
    const refilled = (elapsedMs / 60_000) * this.tokensPerMinute;
    this.available = Math.min(this.tokensPerMinute, this.available + refilled);
    this.lastRefillMs = nowMs;
  }

  /** Tokens currently available — exposed for tests and diagnostics. */
  get availableTokens(): number {
    this.refill();
    return this.available;
    }

  /**
   * Waits until `cost` tokens are available, then spends them.
   *
   * A single request larger than the whole per-minute budget would wait forever, so it is
   * clamped to the bucket size: better to let one oversized call through late than to hang.
   */
  async acquire(cost: number): Promise<void> {
    const needed = Math.min(Math.max(cost, 0), this.tokensPerMinute);
    // Loop rather than compute once: other callers may take tokens while this one waits.
    for (;;) {
      this.refill();
      if (this.available >= needed) {
        this.available -= needed;
        return;
      }
      const deficit = needed - this.available;
      const waitMs = Math.ceil((deficit / this.tokensPerMinute) * 60_000);
      await this.sleep(Math.max(waitMs, 25));
    }
  }
}
