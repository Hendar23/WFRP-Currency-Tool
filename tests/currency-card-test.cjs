const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('wfrp4e-currency-toolbox/scripts/toolbox.js', 'utf8');
function actor(id, n) {
  return { id, name: id, type: 'character', hasPlayerOwner: true,
    system: { details: { status: { tier: 'Brass', standing: 1 } } },
    bankData: { balance: 0, ledger: [] },
    items: [['gc', 240, 1], ['ss', 12, 3], ['bp', 1, n]].map(([type, value, quantity]) => ({
      id: `${id}-${type}`, type: 'money', system: { coinValue: { value }, quantity: { value: quantity } }
    })), getFlag() { return this.bankData; }, async setFlag(_id, _key, value) { this.bankData = value; } };
}
const actors = [actor('A', 2), actor('B', 1)];
actors.forEach(a => { a.uuid = `Actor.${a.id}`; });
const messages = [];
for (const a of actors) a.updateEmbeddedDocuments = async (_type, changes) => {
  for (const change of changes) a.items.find(i => i.id === change._id).system.quantity.value = change['system.quantity.value'];
};
let groupFund = 0;
const context = {
  foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base,
    DialogV2: { confirm: async () => true } },
    handlebars: { renderTemplate: async path => `<div>${path}</div>` } },
    utils: { escapeHTML: value => value, randomID: () => 'entry-id' } },
  Hooks: { once() {}, on() {} },
  canvas: { tokens: { controlled: actors.map(a => ({ id: `token-${a.id}`, name: a.name, actor: a })) } },
  fromUuid: async uuid => [...actors, context.canvas.tokens.controlled[0]?.actor].find(a => a?.uuid === uuid),
  game: { actors, user: { id: 'gm', name: 'Game Master', isGM: true }, users: actors.map(a => ({
    name: `${a.name} player`, isGM: false, character: a, active: false
  })), settings: { get: () => groupFund, set: async (_id, _key, value) => { groupFund = value; } },
    i18n: { localize: key => ({ 'MARKET.Abbrev.GC': 'gc', 'MARKET.Abbrev.SS': 'ss', 'MARKET.Abbrev.BP': 'bp' })[key] ?? key },
    wfrp4e: { utility: { chatDataSetup: (html, type, whisper, opts) => ({ content: html, opts, speaker: { actor: 'A', alias: 'A' } }) },
      market: { creditCommand: (_amount, actor) => actor.items.map(i => ({ _id: i.id, 'system.quantity.value': i.system.quantity.value + (i.system.coinValue.value === 12 ? 1 : 0) })) } } },
  ChatMessage: { create: async data => { messages.push(data); } },
  ui: { notifications: { error: value => { throw Error(value); }, info: () => {} } }
};
vm.createContext(context);
vm.runInContext(source + '\nglobalThis.Toolbox = CurrencyToolbox; globalThis.confirmCard = confirmGMCard;', context);
const app = new context.Toolbox();
app._syncSelection(app.targets);
assert.deepEqual([...app.selected], ['token-A', 'token-B']);
app.mode = 'pay'; app.amount = { gc: 1, ss: 2, bp: 0 };
app._capture = () => {};
app.element = { querySelector: () => ({ disabled: false }) };
app.render = async () => {};
(async () => {
  await app._apply();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, 'pay');
  assert.equal(messages[0].system.payString, '1gc2ss0bp');
  assert.equal(messages[0].opts.forceWhisper, 'A player');
  assert.equal(messages[0].user, 'gm');
  assert.equal(messages[0].speaker.alias, 'Game Master');
  assert.equal(messages[0].speaker.actor, undefined);
  assert.equal(actors[0].items[0].system.quantity.value, 1);
  app.mode = 'split'; app.amount = { gc: 0, ss: 0, bp: 5 };
  await app._apply();
  assert.equal(messages.length, 4);
  assert.equal(messages[2].type, 'credit');
  assert.equal(messages[2].system.payString, '0gc0ss2bp');
  assert.equal(groupFund, 1);
  context.canvas.tokens.controlled = [context.canvas.tokens.controlled[1]];
  app._syncSelection(app.targets);
  assert.deepEqual([...app.selected], ['token-B']);
  context.canvas.tokens.controlled = [{ id: 'gm-token', name: 'GM Character', actor: actor('GM', 6) }];
  context.canvas.tokens.controlled[0].actor.uuid = 'Actor.GM';
  context.canvas.tokens.controlled[0].actor.updateEmbeddedDocuments = async (_type, changes) => {
    for (const change of changes) context.canvas.tokens.controlled[0].actor.items.find(i => i.id === change._id).system.quantity.value = change['system.quantity.value'];
  };
  app._syncSelection(app.targets);
  app.mode = 'credit'; app.amount = { gc: 0, ss: 1, bp: 0 };
  await app._apply();
  assert.equal(messages[4].whisper[0], 'gm');
  assert.equal(messages[4].flags['wfrp4e-currency-toolbox'].actorUuid, 'Actor.GM');
  assert.equal(messages[4].speaker.alias, 'Game Master');
  const gmActor = context.canvas.tokens.controlled[0].actor;
  const card = { id: 'card', flags: messages[4].flags, getFlag: () => 'Actor.GM',
    update: async () => { card.flags['wfrp4e-currency-toolbox'].claimed = true; } };
  await context.confirmCard(card, { disabled: false, textContent: '' });
  assert.equal(gmActor.items[1].system.quantity.value, 4);
  assert.equal(card.flags['wfrp4e-currency-toolbox'].claimed, true);
  context.canvas.tokens.controlled = actors.map(a => ({ id: `token-${a.id}`, name: a.name, actor: a }));
  app._syncSelection(app.targets);
  actors[0].system.details.status = { tier: 's', standing: 3, value: 'Silver 3' };
  actors[1].system.details.status = { tier: 'g', standing: 1, value: 'Gold 1' };
  app.mode = 'living';
  await app._apply();
  assert.equal(messages[5].system.payString, '0gc1ss6bp');
  assert.equal(messages[6].system.payString, '0gc10ss0bp');
  assert.equal(messages[5].system.product, 'Daily living costs: A');
  assert.equal(actors[0].items[0].system.quantity.value, 1);
  actors[0].system.details.status = { tier: 'b', standing: 1, value: 'Brass 1' };
  await app._apply();
  assert.equal(messages[7].system.payString, '0gc0ss1bp');
  actors[0].system.details.status = { value: 'Silver 1' };
  await app._apply();
  assert.equal(messages[9].system.payString, '0gc0ss6bp');
  actors[0].bankData.balance = 361;
  actors[1].bankData.balance = 30;
  app.mode = 'withdraw'; app.amount = { gc: 0, ss: 1, bp: 0 };
  app.maxWithdraw.add('token-A');
  await app._apply();
  assert.equal(actors[0].bankData.balance, 0);
  assert.equal(actors[1].bankData.balance, 18);
  assert.equal(actors[0].bankData.ledger[0].amount, 361);
  app.mode = 'wipe';
  await app._apply();
  assert.equal(actors[1].bankData.balance, 0);
  assert.equal(actors[1].bankData.ledger[1].type, 'wipe');
  assert.equal(actors[1].bankData.ledger[1].amount, 18);
  assert.equal(messages.at(-1).speaker.alias, 'Game Master');
  console.log('Native card smoke tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
