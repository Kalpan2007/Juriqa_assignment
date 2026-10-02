import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from './rate-limiter';

/**
 * Time and sleeping are injected, so these tests are deterministic and instant — no real
 * waiting, and no flakiness from a slow machine.
 */
function makeClock() {
  let nowMs = 0;
  const sleeps: number[] = [];
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    advance: (ms: number) => {
      nowMs += ms;
    },
    sleeps,
  };
}

describe('TokenBucketLimiter', () => {
  it('starts full', () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(1000, clock.now, clock.sleep);
    expect(limiter.availableTokens).toBe(1000);
  });

  it('spends tokens without waiting while budget remains', async () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(1000, clock.now, clock.sleep);

    await limiter.acquire(400);
    await limiter.acquire(400);

    expect(clock.sleeps).toEqual([]);
    expect(limiter.availableTokens).toBeCloseTo(200, 5);
  });

  it('waits instead of failing when the budget is exhausted', async () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(1000, clock.now, clock.sleep);

    await limiter.acquire(1000);
    await limiter.acquire(500);

    // It slept rather than throwing — the behaviour that keeps a thorough scan honest.
    expect(clock.sleeps.length).toBeGreaterThan(0);
    expect(clock.sleeps[0]).toBeGreaterThan(0);
  });

  it('refills over time', () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(600, clock.now, clock.sleep);

    void limiter.acquire(600);
    clock.advance(30_000); // half a minute

    expect(limiter.availableTokens).toBeCloseTo(300, 0);
  });

  it('never refills past the bucket size', () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(600, clock.now, clock.sleep);

    clock.advance(10 * 60_000);

    expect(limiter.availableTokens).toBe(600);
  });

  it('clamps a request larger than the whole budget instead of hanging forever', async () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(100, clock.now, clock.sleep);

    // 10x the per-minute budget: must still resolve.
    await limiter.acquire(1000);

    expect(limiter.availableTokens).toBeCloseTo(0, 5);
  });

  it('treats a zero or negative cost as free', async () => {
    const clock = makeClock();
    const limiter = new TokenBucketLimiter(100, clock.now, clock.sleep);

    await limiter.acquire(0);
    await limiter.acquire(-50);

    expect(clock.sleeps).toEqual([]);
    expect(limiter.availableTokens).toBe(100);
  });
});
