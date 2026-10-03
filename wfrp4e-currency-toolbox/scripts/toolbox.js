const ID = "wfrp4e-currency-toolbox";
const VALUES = { gc: 240, ss: 12, bp: 1 };
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function coins(bp) {
  return { gc: Math.floor(bp / 240), ss: Math.floor(bp % 240 / 12), bp: bp % 12 };
}

function format(bp) {
  const c = coins(bp);
  return `${c.gc} GC  ${c.ss} SS  ${c.bp} BP`;
}

function moneyItems(actor) {
  const items = actor.items.filter(i => i.type === "money");
  const result = {};
  for (const [key, value] of Object.entries(VALUES)) {
    const matches = items.filter(i => Number(i.system.coinValue?.value) === value);
    if (matches.length !== 1) throw new Error(`${actor.name}: expected one ${key.toUpperCase()} money item, found ${matches.length}.`);
    result[key] = matches[0];
  }
  return result;
}

function purse(actor) {
  const items = moneyItems(actor);
  return Object.entries(VALUES).reduce((sum, [key, value]) => {
    const count = Number(items[key].system.quantity?.value);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${actor.name}: invalid ${key.toUpperCase()} quantity.`);
    return sum + count * value;
  }, 0);
}

function bank(actor) {
  const data = actor.getFlag(ID, "bank");
  return { balance: data?.balance ?? 0, ledger: data?.ledger ?? [] };
}

function livingCost(actor) {
  const status = actor.system?.details?.status;
  const label = String(status?.value ?? "").trim().match(/^(brass|silver|gold|[bsg])\s*(\d+)$/i);
  const tier = String(status?.tier || label?.[1] || "").trim().toLowerCase();
  const standing = Number(status?.standing ?? label?.[2]);
  const denomination = { b: 1, brass: 1, s: 12, silver: 12, g: 240, gold: 240 }[tier];
  if (!denomination || !Number.isSafeInteger(standing) || standing < 1)
    throw new Error(`${actor.name}: current Social Status is missing or invalid.`);
  // Half the Standing in the tier's denomination, rounded up at a half penny.
  return Math.ceil(standing * denomination / 2);
}

function validInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative whole number.`);
  return value;
}

function allocate(total, count) {
  return { each: Math.floor(total / count), remainder: total % count };
}

function moneyString(bp) {
  const c = coins(bp);
  return Object.entries(c).map(([key, value]) => `${value}${game.i18n.localize(`MARKET.Abbrev.${key.toUpperCase()}`)}`).join("");
}

function assignedPlayer(actor) {
  const users = Array.from(game.users).filter(user => !user.isGM && user.character?.id === actor.id);
  return users.length === 1 ? users[0] : null;
}

function gmSpeaker() {
  return { alias: game.user.name };
}

async function postMoneyCard(row, mode, amount, reason) {
  const player = assignedPlayer(row.actor);
  if (!player) return postGMCard(row, mode, amount, reason);
  const amountText = moneyString(amount);
  const c = coins(amount);
  const template = mode === "pay" ? "market-pay.hbs" : "market-credit.hbs";
  const data = mode === "pay"
    ? { product: reason, QtGC: c.gc, QtSS: c.ss, QtBP: c.bp }
    : { gc: c.gc, ss: c.ss, bp: c.bp, splits: [""] };
  const html = await foundry.applications.handlebars.renderTemplate(`systems/wfrp4e/templates/chat/market/${template}`, data);
  const options = {
    forceWhisper: player.name,
    flavor: reason ? `For: ${reason}` : undefined,
    alias: game.i18n.localize(mode === "pay" ? "MARKET.PayRequest" : "MARKET.CreditRequest")
  };
  const chatData = game.wfrp4e.utility.chatDataSetup(html, "roll", false, options);
  chatData.user = game.user.id;
  chatData.speaker = gmSpeaker();
  chatData.type = mode === "pay" ? "pay" : "credit";
  chatData.system = mode === "pay"
    ? { payString: amountText, player: player.name, product: reason }
    : { payString: amountText, splits: [""], reason };
  await ChatMessage.create(chatData);
}

async function postGMCard(row, mode, amount, reason) {
  const verb = mode === "pay" ? "Pay" : "Receive";
  const name = foundry.utils.escapeHTML(row.actor.name);
  const detail = reason ? `<p>${foundry.utils.escapeHTML(reason)}</p>` : "";
  await ChatMessage.create({
    content: `<div class="currency-chat-card"><p><strong>${name}</strong>: ${verb} ${format(amount)}</p>${detail}<button type="button" data-currency-confirm>${verb} as ${name}</button></div>`,
    user: game.user.id,
    speaker: gmSpeaker(),
    whisper: [game.user.id],
    flags: { [ID]: { actorUuid: row.actor.uuid, mode, amount, claimed: false } }
  });
}

const pendingCards = new Set();
async function confirmGMCard(message, button) {
  if (!game.user.isGM || pendingCards.has(message.id)) return;
  const data = message.getFlag(ID, "actorUuid") ? message.flags[ID] : null;
  if (!data || data.claimed || !["pay", "credit"].includes(data.mode)) return;
  pendingCards.add(message.id);
  button.disabled = true;
  try {
    const actor = await fromUuid(data.actorUuid);
    if (!actor) throw new Error("The target actor is no longer available.");
    const amount = moneyString(data.amount);
    const money = data.mode === "pay"
      ? game.wfrp4e.market.payCommand(amount, actor)
      : game.wfrp4e.market.creditCommand(amount, actor);
    if (!money) throw new Error(`Could not ${data.mode} ${actor.name}. Check the WFRP money items and balance.`);
    await actor.updateEmbeddedDocuments("Item", money);
    await message.update({ [`flags.${ID}.claimed`]: true });
    button.textContent = `Completed for ${actor.name}`;
    ui.notifications.info(`${actor.name}: ${data.mode} complete.`);
  } catch (error) {
    ui.notifications.error(error.message);
    button.disabled = false;
  } finally { pendingCards.delete(message.id); }
}

class CurrencyToolbox extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: ID,
    classes: [ID],
    window: { title: "WFRP 4e - Money and Banking Tool", resizable: true },
    position: { width: 760, height: 720 }
  };

  static PARTS = { main: { template: `modules/${ID}/templates/toolbox.hbs` } };

  selected = new Set();
  visibleTokens = new Set();
  maxWithdraw = new Set();
  splitChoice = null;
  mode = "pay";
  amount = { gc: 0, ss: 0, bp: 0 };
  rate = 5;
  reason = "";

  get targets() {
    const seen = new Set();
    return (canvas?.tokens?.controlled ?? []).filter(token => {
      if (!token.actor || seen.has(token.actor.uuid)) return false;
      seen.add(token.actor.uuid);
      return true;
    }).map(token => ({ id: token.id, actor: token.actor, name: token.name || token.actor.name }));
  }

  _syncSelection(targets) {
    const current = new Set(targets.map(target => target.id));
    this.selected = new Set([...this.selected].filter(id => current.has(id)));
    for (const id of current) if (!this.visibleTokens.has(id)) this.selected.add(id);
    this.visibleTokens = current;
    this.maxWithdraw = new Set([...this.maxWithdraw].filter(id => current.has(id)));
  }

  async _prepareContext() {
    const targets = this.targets;
    this._syncSelection(targets);
    const actors = targets.map(({ id, actor: a, name }) => {
      let error = "", cash = 0;
      try { cash = purse(a); } catch (e) { error = e.message; }
      const account = bank(a);
      return { id, name, selected: this.selected.has(id),
        cash: format(cash), balance: format(account.balance), max: this.maxWithdraw.has(id), error };
    });
    const single = targets.find(target => this.selected.has(target.id));
    return { actors, mode: this.mode, isInterest: this.mode === "interest",
      isWithdraw: this.mode === "withdraw", isLiving: this.mode === "living",
      isWipe: this.mode === "wipe", showCoins: !["interest", "living", "wipe"].includes(this.mode),
      amount: this.amount, rate: this.rate,
      reason: this.reason,
      ledger: this.selected.size === 1 && single ? bank(single.actor).ledger.slice(-8).reverse().map(x => ({
        ...x, amountText: format(x.amount), balanceText: format(x.after),
        dateText: new Date(x.date).toLocaleString()
      })) : [] };
  }

  _capture() {
    const root = this.element;
    this.selected = new Set([...root.querySelectorAll("[data-actor]:checked")].map(el => el.dataset.actor));
    this.reason = root.querySelector("[name=reason]")?.value.trim() ?? this.reason;
    this.amount = Object.fromEntries(Object.keys(VALUES).map(k =>
      [k, Number(root.querySelector(`[name=${k}]`)?.value ?? this.amount[k])]));
    this.rate = Number(root.querySelector("[name=rate]")?.value ?? this.rate);
  }

  _plan() {
    const targets = this.targets.filter(target => this.selected.has(target.id));
    if (!targets.length) throw new Error("Select at least one token on the canvas.");
    if (!["interest", "living", "wipe"].includes(this.mode) &&
      Object.values(this.amount).some(n => !Number.isSafeInteger(n) || n < 0))
      throw new Error("Enter whole, non-negative coin amounts.");
    const amount = ["interest", "living", "wipe"].includes(this.mode)
      ? 0 : this.amount.gc * 240 + this.amount.ss * 12 + this.amount.bp;
    validInteger(amount, "Amount");
    if (this.mode === "interest") {
      if (!Number.isFinite(this.rate) || this.rate < 0 || this.rate > 100)
        throw new Error("Interest must be between 0% and 100%.");
    } else if (!["living", "wipe", "withdraw"].includes(this.mode) && !amount)
      throw new Error("Enter an amount greater than zero.");
    const split = this.mode === "split" ? allocate(amount, targets.length) : null;
    if (split && split.each < 1) throw new Error("The reward is too small to give each selected character one brass penny.");
    if (split) {
      const key = `${amount}:${targets.map(target => target.id).sort().join(":")}`;
      if (this.splitChoice?.key !== key)
        this.splitChoice = { key, id: targets[Math.floor(Math.random() * targets.length)].id };
    }
    const rows = targets.map(({ actor, id }) => {
      const cash = purse(actor), account = bank(actor);
      validInteger(account.balance, `${actor.name}'s bank balance`);
      const rowAmount = this.mode === "living" ? livingCost(actor)
        : this.mode === "withdraw" && this.maxWithdraw.has(id) ? account.balance
        : this.mode === "split" ? split.each + (id === this.splitChoice.id ? split.remainder : 0)
        : amount;
      if (this.mode === "withdraw" && !rowAmount)
        throw new Error(`${actor.name}: enter an amount or select Max for an account with a balance.`);
      let deltaCash = 0, deltaBank = 0;
      switch (this.mode) {
        case "pay": case "living": deltaCash = -rowAmount; break;
        case "credit": deltaCash = amount; break;
        case "split": deltaCash = rowAmount; break;
        case "deposit": deltaCash = -amount; deltaBank = amount; break;
        case "withdraw": deltaCash = rowAmount; deltaBank = -rowAmount; break;
        case "interest": deltaBank = Math.round(account.balance * this.rate / 100); break;
        case "wipe": deltaBank = -account.balance; break;
        default: throw new Error("Unknown transaction.");
      }
      const afterCash = cash + deltaCash, afterBank = account.balance + deltaBank;
      if (afterCash < 0 && !["pay", "living"].includes(this.mode))
        throw new Error(`${actor.name} cannot afford this payment.`);
      if (afterBank < 0) throw new Error(`${actor.name} has insufficient bank funds.`);
      if (afterCash >= 0) validInteger(afterCash, "Purse balance");
      validInteger(afterBank, "Bank balance");
      return { actor, cash, account, afterCash, afterBank, deltaCash, deltaBank, rowAmount };
    });
    if (this.mode === "wipe" && rows.every(row => row.account.balance === 0))
      throw new Error("The selected bank balances are already zero.");
    return { rows, split };
  }

  _preview() {
    const el = this.element.querySelector("[data-preview]");
    try {
      this._capture();
      const { rows } = this._plan();
      const entries = rows.map(r => `<li>${foundry.utils.escapeHTML(r.actor.name)}:<br>${this.mode === "living" ? `daily cost ${format(r.rowAmount)}<br>` : ""}${r.afterCash < 0 ? "insufficient funds" : `purse ${format(r.afterCash)}`}<br>bank ${format(r.afterBank)}</li>`).join("");
      el.innerHTML = `<strong>${["pay", "credit", "split", "living"].includes(this.mode) ? "If the transactions are accepted" : "After this transaction"}</strong><ul>${entries}</ul>` +
        (this.mode === "interest" ? `<p>Interest is rounded to the nearest brass penny.</p>` : "");
      this.element.querySelector("[data-apply]").disabled = false;
    } catch (error) {
      el.textContent = error.message;
      this.element.querySelector("[data-apply]").disabled = true;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-mode]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.mode));
      button.addEventListener("click", async () => {
      this._capture();
      this.mode = button.dataset.mode;
      await this.render({ force: true });
      });
    });
    this.element.querySelectorAll("[data-max]").forEach(button => button.addEventListener("click", () => {
      this._capture();
      const id = button.dataset.max;
      if (this.maxWithdraw.has(id)) this.maxWithdraw.delete(id);
      else this.maxWithdraw.add(id);
      button.setAttribute("aria-pressed", String(this.maxWithdraw.has(id)));
      button.textContent = this.maxWithdraw.has(id) ? "Max selected" : "Max";
      this._preview();
    }));
    this.element.querySelectorAll("input, select").forEach(el => el.addEventListener("input", () => this._preview()));
    this.element.querySelector("[data-all]").addEventListener("click", () => {
      this.element.querySelectorAll("[data-actor]").forEach(el => el.checked = true);
      this._preview();
    });
    this.element.querySelector("[data-none]").addEventListener("click", () => {
      this.element.querySelectorAll("[data-actor]").forEach(el => el.checked = false);
      this._preview();
    });
    this.element.querySelector("[data-apply]").addEventListener("click", () => this._apply());
    this._preview();
  }

  async _apply() {
    if (!game.user.isGM) return ui.notifications.error("Only the GM can apply money transactions.");
    let plan;
    try { this._capture(); plan = this._plan(); }
    catch (error) { return ui.notifications.error(error.message); }
    const button = this.element.querySelector("[data-apply]");
    button.disabled = true;
    if (this.mode === "wipe") {
      const names = plan.rows.filter(row => row.account.balance).map(row =>
        `${foundry.utils.escapeHTML(row.actor.name)} (${format(row.account.balance)})`).join("<br>");
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Wipe bank balances?" },
        content: `<p>Set these bank balances to zero?</p><p>${names}</p>`
      });
      if (!confirmed) { button.disabled = false; return; }
    }
    if (["pay", "credit", "split", "living"].includes(this.mode)) {
      const failures = [], posted = [];
      for (const row of plan.rows) {
        try {
          if (purse(row.actor) !== row.cash) throw new Error("Purse changed. Review and retry.");
          const amount = row.rowAmount;
          if (amount < 1) throw new Error("This share is less than one brass penny.");
          const reason = this.mode === "living" ? `Daily living costs: ${row.actor.name}` : this.reason;
          await postMoneyCard(row, ["pay", "living"].includes(this.mode) ? "pay" : "credit", amount, reason);
          posted.push(row.actor.name);
        } catch (error) { failures.push(`${row.actor.name}: ${error.message}`); }
      }
      if (this.mode === "split" && !failures.length) this.splitChoice = null;
      if (failures.length) ui.notifications.error(failures.join(" | "));
      if (posted.length) ui.notifications.info(`Posted ${posted.length} money card(s). No purses changed yet.`);
      await this.render({ force: true });
      return;
    }
    const completed = [], failures = [];
    for (const row of plan.rows) {
      try {
        if (this.mode === "wipe" && !row.account.balance) continue;
        // Revalidate against the live documents before each write.
        if (purse(row.actor) !== row.cash || bank(row.actor).balance !== row.account.balance)
          throw new Error("Balance changed while the panel was open. Review the preview and retry.");
        const items = moneyItems(row.actor);
        let counts;
        if (row.deltaCash > 0 && this.mode === "credit") {
          counts = Object.fromEntries(Object.keys(VALUES).map(k => [k, Number(items[k].system.quantity.value) + this.amount[k]]));
        } else if (row.deltaCash < 0 && ["pay", "deposit"].includes(this.mode) &&
          Object.keys(VALUES).every(k => Number(items[k].system.quantity.value) >= this.amount[k])) {
          counts = Object.fromEntries(Object.keys(VALUES).map(k => [k, Number(items[k].system.quantity.value) - this.amount[k]]));
        } else counts = coins(row.afterCash);
        const previous = Object.fromEntries(Object.keys(VALUES).map(k => [k, Number(items[k].system.quantity.value)]));
        const changes = Object.keys(VALUES).map(k => ({ _id: items[k].id, "system.quantity.value": counts[k] }));
        if (row.deltaCash) await row.actor.updateEmbeddedDocuments("Item", changes);
        if (row.deltaBank) {
          const entry = { id: foundry.utils.randomID(), date: new Date().toISOString(),
            type: this.mode, amount: Math.abs(row.deltaBank), before: row.account.balance,
            after: row.afterBank, reason: this.reason };
          try {
            await row.actor.setFlag(ID, "bank", { balance: row.afterBank,
              ledger: [...row.account.ledger, entry].slice(-100) });
          } catch (error) {
            if (row.deltaCash) {
              try { await row.actor.updateEmbeddedDocuments("Item", Object.keys(VALUES).map(k => ({
                _id: items[k].id, "system.quantity.value": previous[k]
              }))); } catch (rollbackError) { console.error(`${ID}: failed to restore ${row.actor.name}'s purse`, rollbackError); }
            }
            throw error;
          }
        }
        completed.push(row.actor.name);
      } catch (error) { failures.push(`${row.actor.name}: ${error.message}`); }
    }
    if (completed.length) {
      const cleanNames = completed.map(name => foundry.utils.escapeHTML(name)).join(", ");
      const cleanReason = foundry.utils.escapeHTML(this.reason);
        const amount = this.mode === "interest" ? `${this.rate}% interest`
          : this.mode === "wipe" ? "balances cleared"
          : this.mode === "withdraw" && this.maxWithdraw.size ? "amounts shown in each actor's bank ledger"
          : format(this.amount.gc * 240 + this.amount.ss * 12 + this.amount.bp);
      await ChatMessage.create({
        content: `<p><strong>${foundry.utils.escapeHTML(this.mode)}</strong>: ${amount}${cleanReason ? ` (${cleanReason})` : ""}</p><p>${cleanNames}</p>`,
        user: game.user.id, speaker: gmSpeaker()
      });
    }
    if (failures.length) ui.notifications.error(failures.join(" | "));
    else ui.notifications.info(`Updated ${completed.length} character(s).`);
    await this.render({ force: true });
  }
}

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || game.system.id !== "wfrp4e") return;
  const token = controls.tokens;
  if (!token?.tools) return;
  token.tools.currencyToolbox = {
    name: "currencyToolbox", title: "Money & Banking Tool", icon: "fa-solid fa-coins",
    order: Object.keys(token.tools).length, button: true, visible: true,
    onChange: () => {
      const existing = foundry.applications.instances.get(ID);
      if (existing) existing.close();
      else new CurrencyToolbox().render({ force: true });
    }
  };
});

Hooks.on("controlToken", () => {
  const app = foundry.applications.instances.get(ID);
  if (app?.rendered) app.render({ force: true });
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  const button = html.querySelector("[data-currency-confirm]");
  if (!button) return;
  if (message.flags?.[ID]?.claimed) {
    button.disabled = true;
    button.textContent = "Completed";
  } else if (!game.user.isGM) button.disabled = true;
  else button.addEventListener("click", () => confirmGMCard(message, button));
});
