# rLogs browser optimizer

The JavaScript and WebAssembly files in this directory are generated from:

```text
RLogs/plugins/games/blue-protocol-star-resonance/features/module-optimizer/wasm
```

They contain the same Rust search/scoring engine used by the native Plugin Lab
plus the reviewed module catalog for Global Steam client builds `24252055` and
`24687926`. The latter is admitted by an exact scoring-equivalence receipt.
The browser calls the engine in a Web Worker, so full-inventory searches do not
block page interaction.

The adapter accepts only the typed optimizer request. Profile input is reduced
to string instance IDs, config IDs, quality, and module part/link values before
it crosses the worker boundary.

Regenerate the checked-in browser files with `wasm-bindgen --target web
--no-typescript` so the hand-maintained TypeScript worker contract remains the
single binding definition.
