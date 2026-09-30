# WFRP 4e - Money and Banking Tool

A Foundry VTT v14 module for the WFRP4e system. This replaces the standalone calculator in this repository.

**Install by manifest URL:**

```
https://raw.githubusercontent.com/Hendar23/WFRP-Currency-Tool/main/wfrp4e-currency-toolbox/module.json
```

Paste the URL into Foundry's **Install Module** dialog, then enable **WFRP 4e - Money and Banking Tool** in your world. The module appears as a coins button under the Token controls for the GM.

Select tokens on the canvas, then use the tool's checkboxes to choose which of those tokens to include. Both player controlled and GM controlled actors are supported. The action buttons show only the fields needed for that action. Request payments or one day's living costs, give money to each actor, split one reward with any leftover pennies assigned to a randomly chosen recipient, deposit and withdraw from bank balances, apply interest, or wipe bank balances after confirmation. Each selected actor has a **Max** button when withdrawing, so you can withdraw different full balances in one action or mix Max with a shared amount. All actions show a per-actor preview. Interest rounds to the nearest brass penny. Changes to the actor purse use the existing WFRP money items; bank balances and recent transactions are stored on those actors. Only the GM can use the tool.

Pay, Living costs, Credit and Split post a card for each actor. Living costs use the WFRP rulebook guide of half the actor's current Social Status Standing per day, in that Status tier's coin: Gold, Silver or Brass. The tool converts odd Standing into smaller coins and rounds a half brass penny up to one penny. It leaves Status changes to the GM. If an actor is assigned as a player's character, its native WFRP card is whispered to that player, including when offline, for them to click. Other actors receive a card whispered to the GM with a button tied to the exact actor; clicking uses the WFRP market functions and coin animation. Bank deposits, withdrawals, interest and wipes are GM applied actions and write to the actor's bank ledger. Wiping clears the bank balance without changing the purse. Native WFRP pay cards can be clicked more than once, so players should click each request only once. Unlinked token actors store their bank balance on that particular token.

Partial failures are reported by character, so review the preview and chat after any error. A ZIP for this version lives in `dist/` and contains the module files at its root.
