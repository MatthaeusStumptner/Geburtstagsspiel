import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGameSession } from '@franz-lola/game-core';
import { LEVEL_DOCUMENTS } from '../src/game/level-catalog.js';

const EXPECTED_PELLET_HASHES = {
  home: { easy: '1fd5d8e2a589f542be703bf574df3f1a49f8abfebb3cfb4cd0638939b7c3dcf8', normal: 'cef0257324e54024d7bf9910d9cc26d2737461e7da93628db03c17c50286ef9b', hard: '58dc160ee34e80fb3b422caadc7d9f9997451f0e8ccea9153e109364a924e7ac' },
  hals: { easy: '35d4806bf1a9747ad898ea540100ea9d3d3f49eaed11a350f5d9f49c2775bd16', normal: '899d9dbdc92c75a2df6334f6faf7a37d9c7ff7a03bc8955156fe1f81868acdf5', hard: 'b53eab458b861e93fcf51c3ca91045edb0f4dbcd470b1249b27e343dff84ff99' },
  oberhaus: { easy: 'ec815e01ec415f3aba2c05a2689648203d629530e6cfb9f34e5b5aa9cb50a6e7', normal: '59af86346a030af398d0127e6ff5af3fa9b609183b0f26f49e0131e626c7e542', hard: '3e6621823f5b4759923589a19e3029820601836ca2e7bd9e1facfe9ceb169681' },
  dom: { easy: '43ba7ebc6dfffc0e33cb13e52aaacb45c1f8395f4b441870992801459fa189bf', normal: '033cea073b1ca332ec9db28cdf249732046b74ec6f503b7ca22b3fa0c35bd4de', hard: '4c2a70b301fa88082287ad3abd094d00167814c797183d0c3da81d7e069403a0' },
  dreifluesseeck: { easy: '4f3095f91085cf5146f2792cc443f23c6a1b1849eb0386c6036f6a348f52b6c3', normal: 'f547285c763a035e0300840a15fc1027c25612ef700b034fb4f4361614acf68a', hard: 'dec13ef5086056d74c075ac3c4d0305bc7d2a8ab11ae2ed3805dfce7fb0122ef' },
  uni: { easy: '82980579b5c54c3e71455127d3fc970b549576c5f57b2096cd174c04fb1665b1', normal: '28ff680592f3c704bf1f789413cb8d0d7167b1566da2de9bd8e7c55b271e77f4', hard: 'f3a6f75aff047cafeb76ed1ade36378b12777a224931d58a129028b8f6f3906f' },
  bschuett: { easy: 'd2ff3ae811932930709c1be0d4d79c8ae09b68604fcb0fa337d32c93fbbcbdc3', normal: '83575ddea3381cdf1de75783f443fa1fe0e363df2a3cf36bb68874334a363b4f', hard: 'cee6ee3c19b5246e783ca7f7a1b0cc36b328c0347ea533b5c938d27714de4ccb' },
  tabakfabrik: { easy: '3c4e75e7ffa1c8afadbb176432ad6c46dd11a97ee8a5feb5b0c8eeb0f8f63a75', normal: '26107d06cc000d79b8e75229724693656a9a6f94b2f8136b11c1f88169010895', hard: '88df0b2ae060f3da03cfcbb59071bfabd946b5eee83ebbc7ec4a4fcbe199cf4b' },
  zauberberg: { easy: '27a55c4ddeed2c4b0b9e24bea3d7e0a7e9a34e90ef112edcfc694148155b3f97', normal: 'a78972bf08307a707e128994c5bb8f7f555708c17673715c67faea95e12647a6', hard: '2621c1d472ca752412c83c4f5bdfc217b20d4cd43d86e871904bdbb4296fddf3' },
};

function pelletHash(pellets) {
  return createHash('sha256').update(JSON.stringify(pellets)).digest('hex');
}

for (const level of LEVEL_DOCUMENTS) {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    test(`published pellet placement preserves ${level.id}/${difficulty}`, () => {
      const snapshot = createGameSession({
        level,
        difficulty,
        seed: level.gameplay.pelletSeed,
      }).snapshot();
      assert.equal(pelletHash(snapshot.pellets), EXPECTED_PELLET_HASHES[level.id][difficulty]);
    });
  }
}
