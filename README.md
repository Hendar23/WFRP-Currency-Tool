# WFRP Money & Banking

A Foundry VTT v14 module for the WFRP4e system. This replaces the standalone calculator in this repository.

**Install by manifest URL:**

```
https://raw.githubusercontent.com/Hendar23/WFRP-Currency-Tool/main/wfrp4e-currency-toolbox/module.json
```

Paste the URL into Foundry's **Install Module** dialog, then enable **WFRP Money & Banking** in your world. The module appears as a coins button under the Token controls for the GM.

Select any combination of player controlled characters, including offline players' characters. Pay or credit each selected character, split one reward exactly with the remainder recorded in a group fund, deposit and withdraw from actor bank balances, or apply interest deliberately to selected balances. All actions show a per-character preview. Interest rounds to the nearest brass penny. Changes to the actor purse use the existing WFRP money items; bank balances and recent transactions are stored on those actors. Only the GM can use the tool. Transactions are applied immediately, and a summary appears in chat.

The group fund displays unallocated pennies from splits; it does not automatically belong to an actor or support withdrawals yet. Partial failures are reported by character, so review the preview and chat after any error. A ZIP for this version lives in `dist/` and contains the module folder at its root.
