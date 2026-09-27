# WFRP Money & Banking

A Foundry VTT v14 module for the WFRP4e system. This replaces the standalone calculator in this repository.

**Install by manifest URL:**

```
https://raw.githubusercontent.com/Hendar23/WFRP-Currency-Tool/main/wfrp4e-currency-toolbox/module.json
```

Paste the URL into Foundry's **Install Module** dialog, then enable **WFRP Money & Banking** in your world. The module appears as a coins button under the Token controls for the GM.

Select any combination of player controlled characters, including offline players' characters. Pay or credit each selected character, split one reward exactly with the remainder recorded in a group fund, deposit and withdraw from actor bank balances, or apply interest deliberately to selected balances. All actions show a per-character preview. Interest rounds to the nearest brass penny. Changes to the actor purse use the existing WFRP money items; bank balances and recent transactions are stored on those actors. Only the GM can use the tool.

Pay, Credit and Split post one native WFRP chat card per selected actor. The player clicks Pay or Receive, so the WFRP system performs the change and its coin animation. Cards are whispered to the player, including when offline. Each actor must be assigned as exactly one player's character in Foundry, since native WFRP chat cards use the clicking player's assigned character. Bank deposits, withdrawals and interest remain GM applied actions and write to the actor's bank ledger. WFRP pay cards can be clicked more than once, so players should click each request only once.

The group fund displays unallocated pennies from splits; it does not automatically belong to an actor or support withdrawals yet. Partial failures are reported by character, so review the preview and chat after any error. A ZIP for this version lives in `dist/` and contains the module folder at its root.
