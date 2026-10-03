#!/usr/bin/env node
/* Dump the Mulberry32 stream the harness uses, so the Swift `ParityRNG` can be checked against the
 * JS engine that produced every golden.
 *
 * This is deliberately a standalone file rather than a mode of `trace.mjs`: the P0 gate
 * (`trace.mjs --check`) must keep producing exactly the traces it produced when M0 was signed off,
 * and adding a flag to that file invites an accidental behaviour change in the generator the whole
 * corpus depends on.
 *
 *   node js/rng_dump.mjs --seeds 1,42,12648430 --count 10000 > vectors.txt
 *
 * The generator is copied verbatim from `trace.mjs` (itself the shipped harness). One value per
 * line, formatted with `toPrecision(17)` - 17 *significant* digits, the smallest precision that
 * round-trips every IEEE double.
 *
 * Do not "match the harness" by switching this to `toFixed(17)`. `assertRng()` in `trace.mjs`
 * compares `toFixed(17)` text against its pinned vector, but `toFixed(17)` means 17 digits *after
 * the decimal point*, so any draw below 0.1 carries fewer than 17 significant digits and re-parses
 * to a different double than the generator produced. Concretely, seed 1 draw 1 is
 * 0.0027357211802154779 and its `toFixed(17)` text `0.00273572118021548` parses back 5 ULP away.
 * That is harmless for the harness, which only ever compares its own strings to each other, and
 * fatal for a bit-exact port check - which is the only reason this file exists.
 */
import fs from 'node:fs';

const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2), value = argv[i + 1];
    args[key] = value && !value.startsWith('--') ? (i++, value) : true;
}

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const seeds = String(args.seeds || '1,42,12648430').split(',').map(x => Number(x.trim()));
const count = Number(args.count || 10000);

if (args.out) {
    fs.mkdirSync(args.out, { recursive: true });
    for (const seed of seeds) {
        const next = rng(seed);
        const lines = [];
        for (let i = 0; i < count; i++) lines.push(next().toPrecision(17));
        const p = `${args.out}/mulberry32-s${seed}.txt`;
        fs.writeFileSync(p, lines.join('\n') + '\n');
        console.log(`${p}: ${count} values`);
    }
} else {
    for (const seed of seeds) {
        const next = rng(seed);
        for (let i = 0; i < count; i++) console.log(next().toPrecision(17));
    }
}
