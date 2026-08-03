import test from 'node:test';
import assert from 'node:assert/strict';
import { BELL_SEQUENCE, eventsForLocation } from '../src/game/level-events.js';

const location = (overrides = {}) => ({ id: 'uni', river: 'INN', home: false, theme: 'neighborhood', ...overrides });

test('Ilz-Level enthalten den Eisvogel mit Originaltext und beiden Tunnelzonen', () => {
  const [event] = eventsForLocation(location({ id: 'hals', river: 'ILZ · HALS' }));
  assert.equal(event.id, 'ilzvogel');
  assert.equal(event.message.standard, 'Donnerwetter, ein Eisvogel an der Ilz!');
  assert.equal(event.message.dialect, 'Sakradi, a Eisvogl an da Ilz!');
  assert.equal(event.reward, 150);
  assert.deepEqual(event.trigger.zones, [
    { x: 0, y: 12, width: 2, height: 1 },
    { x: 23, y: 12, width: 2, height: 1 },
  ]);
});

test('Zuhause und Bschütt enthalten Lolas Lieblingsplatz', () => {
  const homeEvents = eventsForLocation(location({ id: 'home', river: 'ILZ · GRUBWEG', home: true }));
  const parkEvents = eventsForLocation(location({ id: 'bschuett', river: 'ILZ · BSCHÜTT', theme: 'bschuett' }));
  assert.ok(homeEvents.some((event) => event.id === 'hundewiese'));
  assert.ok(parkEvents.some((event) => event.id === 'hundewiese'));
  assert.equal(homeEvents.find((event) => event.id === 'hundewiese').message.dialect, "Ja mei, d'Lola hod ihr Lieblingsplatzerl gfundn!");
});

test('Dom und Oberhaus enthalten das Glockengeheimnis mit der Originalsequenz', () => {
  for (const id of ['dom', 'oberhaus']) {
    const [event] = eventsForLocation(location({ id }));
    assert.equal(event.id, 'kirchenglockn');
    assert.deepEqual(event.trigger.sequence, BELL_SEQUENCE);
    assert.equal(event.reward, 250);
  }
});

test('Level ohne ursprüngliches Easteregg bleiben ereignisfrei', () => {
  assert.deepEqual(eventsForLocation(location({ id: 'zauberberg', river: 'HAIDENHOF · LIVE-CLUB', theme: 'zauberberg' })), []);
});
