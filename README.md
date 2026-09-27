# WFRP Money & Banking

A Foundry VTT v14 module for the WFRP4e system. This replaces the standalone calculator in this repository.

**Install by manifest URL:**

```
https://raw.githubusercontent.com/Hendar23/WFRP-Currency-Tool/main/wfrp4e-currency-toolbox/module.json
```

Paste the URL into Foundry's **Install Module** dialog, then enable **WFRP Money & Banking** in your world. The module appears as a coins button under the Token controls for the GM.

Select tokens on the canvas, then use the tool's checkboxes to choose which of those tokens to include. Both player controlled and GM controlled actors are supported. Pay or credit each selected actor, split one reward exactly with the remainder recorded in a group fund, deposit and withdraw from actor bank balances, or apply interest deliberately to selected balances. All actions show a per-actor preview. Interest rounds to the nearest brass penny. Changes to the actor purse use the existing WFRP money items; bank balances and recent transactions are stored on those actors. Only the GM can use the tool.

Pay, Credit and Split post a card for each actor. If an actor is assigned as a player's character, its native WFRP card is whispered to that player, including when offline, for them to click. Other actors receive a card whispered to the GM with a button tied to the exact actor; clicking uses the WFRP market functions and coin animation. Bank deposits, withdrawals and interest remain GM applied actions and write to the actor's bank ledger. Native WFRP pay cards can be clicked more than once, so players should click each request only once. Unlinked token actors store their bank balance on that particular token.

The group fund displays unallocated pennies from splits; it does not automatically belong to an actor or support withdrawals yet. Partial failures are reported by character, so review the preview and chat after any error. A ZIP for this version lives in `dist/` and contains the module folder at its root.
