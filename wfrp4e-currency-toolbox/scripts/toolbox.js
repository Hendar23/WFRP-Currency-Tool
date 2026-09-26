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

function validInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative whole number.`);
  return value;
}

function allocate(total, count) {
  return { each: Math.floor(total / count), remainder: total % count };
}

class CurrencyToolbox extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: ID,
    classes: [ID],
    window: { title: "WFRP Money & Banking", resizable: true },
    position: { width: 760, height: 720 }
  };

  static PARTS = { main: { template: `modules/${ID}/templates/toolbox.hbs` } };

  selected = new Set();
  mode = "pay";
  amount = { gc: 0, ss: 0, bp: 0 };
  rate = 5;
  reason = "";

  get actors() {
    return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async _prepareContext() {
    const actors = this.actors.map(a => {
      let error = "", cash = 0;
      try { cash = purse(a); } catch (e) { error = e.message; }
      const account = bank(a);
      return { id: a.id, name: a.name, selected: this.selected.has(a.id),
        cash: format(cash), balance: format(account.balance), error };
    });
    return { actors, mode: this.mode, amount: this.amount, rate: this.rate,
      reason: this.reason, groupFund: format(game.settings.get(ID, "groupFund")),
      ledger: this.selected.size === 1 && this.actors.some(a => this.selected.has(a.id)) ? bank(this.actors.find(a => this.selected.has(a.id))).ledger.slice(-8).reverse().map(x => ({
        ...x, amountText: format(x.amount), balanceText: format(x.after),
        dateText: new Date(x.date).toLocaleString()
      })) : [] };
  }

  _capture() {
    const root = this.element;
    this.selected = new Set([...root.querySelectorAll("[data-actor]:checked")].map(el => el.dataset.actor));
    this.mode = root.querySelector("[name=mode]").value;
    this.reason = root.querySelector("[name=reason]").value.trim();
    this.amount = Object.fromEntries(Object.keys(VALUES).map(k => [k, Number(root.querySelector(`[name=${k}]`).value)]));
    this.rate = Number(root.querySelector("[name=rate]").value);
  }

  _plan() {
    const targets = this.actors.filter(a => this.selected.has(a.id));
    if (!targets.length) throw new Error("Select at least one character.");
    if (Object.values(this.amount).some(n => !Number.isSafeInteger(n) || n < 0))
      throw new Error("Enter whole, non-negative coin amounts.");
    const amount = this.amount.gc * 240 + this.amount.ss * 12 + this.amount.bp;
    validInteger(amount, "Amount");
    if (this.mode === "interest") {
      if (!Number.isFinite(this.rate) || this.rate < 0 || this.rate > 100)
        throw new Error("Interest must be between 0% and 100%.");
    } else if (!amount) throw new Error("Enter an amount greater than zero.");
    const split = this.mode === "split" ? allocate(amount, targets.length) : null;
    const rows = targets.map(actor => {
      const cash = purse(actor), account = bank(actor);
      validInteger(account.balance, `${actor.name}'s bank balance`);
      let deltaCash = 0, deltaBank = 0;
      switch (this.mode) {
        case "pay": deltaCash = -amount; break;
        case "credit": deltaCash = amount; break;
        case "split": deltaCash = split.each; break;
        case "deposit": deltaCash = -amount; deltaBank = amount; break;
        case "withdraw": deltaCash = amount; deltaBank = -amount; break;
        case "interest": deltaBank = Math.round(account.balance * this.rate / 100); break;
        default: throw new Error("Unknown transaction.");
      }
      const afterCash = cash + deltaCash, afterBank = account.balance + deltaBank;
      if (afterCash < 0) throw new Error(`${actor.name} cannot afford this payment.`);
      if (afterBank < 0) throw new Error(`${actor.name} has insufficient bank funds.`);
      validInteger(afterCash, "Purse balance"); validInteger(afterBank, "Bank balance");
      return { actor, cash, account, afterCash, afterBank, deltaCash, deltaBank };
    });
    return { rows, split };
  }

  _preview() {
    const el = this.element.querySelector("[data-preview]");
    try {
      this._capture();
      const { rows, split } = this._plan();
      const entries = rows.map(r => `<li>${foundry.utils.escapeHTML(r.actor.name)}: purse ${format(r.afterCash)}; bank ${format(r.afterBank)}</li>`).join("");
      el.innerHTML = `<strong>After this transaction</strong><ul>${entries}</ul>` +
        (split ? `<p>Each receives ${format(split.each)}. ${format(split.remainder)} goes to the group fund.</p>` : "") +
        (this.mode === "interest" ? `<p>Interest is rounded to the nearest brass penny.</p>` : "");
      this.element.querySelector("[data-apply]").disabled = false;
    } catch (error) {
      el.textContent = error.message;
      this.element.querySelector("[data-apply]").disabled = true;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("[name=mode]").value = this.mode;
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
    const completed = [], failures = [];
    for (const row of plan.rows) {
      try {
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
    if (this.mode === "split" && !failures.length && plan.split.remainder) {
      try { await game.settings.set(ID, "groupFund", game.settings.get(ID, "groupFund") + plan.split.remainder); }
      catch (error) { failures.push(`Group fund: ${error.message}`); }
    }
    if (completed.length) {
      const cleanNames = completed.map(name => foundry.utils.escapeHTML(name)).join(", ");
      const cleanReason = foundry.utils.escapeHTML(this.reason);
      const amount = this.mode === "interest" ? `${this.rate}% interest` : format(this.amount.gc * 240 + this.amount.ss * 12 + this.amount.bp);
      await ChatMessage.create({ content: `<p><strong>${foundry.utils.escapeHTML(this.mode)}</strong>: ${amount}${cleanReason ? ` (${cleanReason})` : ""}</p><p>${cleanNames}</p>` });
    }
    if (failures.length) ui.notifications.error(failures.join(" | "));
    else ui.notifications.info(`Updated ${completed.length} character(s).`);
    await this.render({ force: true });
  }
}

Hooks.once("init", () => {
  game.settings.register(ID, "groupFund", { name: "Group fund (brass pennies)", scope: "world", config: false, type: Number, default: 0 });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || game.system.id !== "wfrp4e") return;
  const token = controls.tokens;
  if (!token?.tools) return;
  token.tools.currencyToolbox = {
    name: "currencyToolbox", title: "Money & Banking", icon: "fa-solid fa-coins",
    order: Object.keys(token.tools).length, button: true, visible: true,
    onChange: () => {
      const existing = foundry.applications.instances.get(ID);
      if (existing) existing.close();
      else new CurrencyToolbox().render({ force: true });
    }
  };
});
