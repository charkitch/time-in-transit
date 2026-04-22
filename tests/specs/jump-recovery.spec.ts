import { test } from '../fixtures/gamePage';
import { getJumpTarget, performFullJump } from '../helpers/jumpHelpers';
import { getGPUSnapshot, assertMemoryBounded } from '../helpers/gpuHelpers';

test.describe('Jump Recovery', () => {
  test('GPU memory stays bounded across multiple jumps', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    const before = await getGPUSnapshot(gamePage.page);

    const target = await getJumpTarget(gamePage.page);
    test.skip(!target, 'No jump target available from current system');

    // Perform 3 jumps and check memory stays bounded
    for (let i = 0; i < 3; i++) {
      const jumpTarget = await getJumpTarget(gamePage.page);
      if (!jumpTarget) break;
      await performFullJump(gamePage.page, jumpTarget);
    }

    const after = await getGPUSnapshot(gamePage.page);
    assertMemoryBounded(before, after, 2.0);
  });
});
