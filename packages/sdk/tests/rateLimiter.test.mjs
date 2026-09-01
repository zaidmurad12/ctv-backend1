import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowRateLimiter } from '../dist/index.js';

function fakeClock(start) {
  let now = start;
  return { advance: (ms) => (now += ms), now: () => now };
}

test('FixedWindowRateLimiter allows requests under the limit without waiting', async () => {
  const clock = fakeClock(0);
  const sleeps = [];
  const limiter = new FixedWindowRateLimiter(2, 1000, clock.now, async (ms) => sleeps.push(ms));

  await limiter.acquire();
  await limiter.acquire();

  assert.deepEqual(sleeps, []);
});

test('FixedWindowRateLimiter waits out the window once the limit is hit', async () => {
  const clock = fakeClock(0);
  const sleeps = [];
  const limiter = new FixedWindowRateLimiter(1, 1000, clock.now, async (ms) => {
    sleeps.push(ms);
    clock.advance(ms);
  });

  await limiter.acquire();
  await limiter.acquire();

  assert.deepEqual(sleeps, [1000]);
});

test('FixedWindowRateLimiter resets the window automatically once elapsed', async () => {
  const clock = fakeClock(0);
  const sleeps = [];
  const limiter = new FixedWindowRateLimiter(1, 1000, clock.now, async (ms) => sleeps.push(ms));

  await limiter.acquire();
  clock.advance(1000);
  await limiter.acquire();

  assert.deepEqual(sleeps, []);
});

test('FixedWindowRateLimiter enforces a cooldown after reportRateLimited', async () => {
  const clock = fakeClock(0);
  const sleeps = [];
  const limiter = new FixedWindowRateLimiter(5, 1000, clock.now, async (ms) => {
    sleeps.push(ms);
    clock.advance(ms);
  });

  limiter.reportRateLimited(5000);
  await limiter.acquire();

  assert.deepEqual(sleeps, [5000]);
});
