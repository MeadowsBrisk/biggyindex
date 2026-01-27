#!/usr/bin/env ts-node
import { categorize } from '../shared/categorization/index';

export type CatCase = {
  name: string;
  description?: string;
  expectPrimary: string | null;
  expectSub?: string[];
  note?: string;
};

const cases: CatCase[] = [
  // Flower vs preroll, edible, paraphernalia, psychedelic, concentrates, hash variants
  { name: 'OG Kush 3.5g', description: 'Top shelf indica flower, dense buds.', expectPrimary: 'Flower' },
  // PreRolls is now a top-level category (not Flower subcategory)
  { name: 'Wedding Cake Pre-Roll 1g', description: 'slow burn preroll joint', expectPrimary: 'PreRolls' },
  { name: '5 Pack Premium Pre-Rolls', description: 'Five pre-rolled joints in a sealed pack hand rolled cones', expectPrimary: 'PreRolls' },
  { name: 'Infused Pre-Roll Hash', description: 'hash infused preroll kief dipped cone', expectPrimary: 'PreRolls', expectSub: ['Infused'] },
  { name: 'Psilocybin Chocolate Bar 3g', description: 'microdose psychedelic shroom chocolate', expectPrimary: 'Psychedelics' },
  // Legacy parity: battery listings are treated as Vapes (Battery/Cartridge subs may appear)
  { name: 'USB Rechargeable Battery', description: 'charger and battery for vape carts', expectPrimary: 'Vapes' },
  { name: 'Live Resin Shatter 1g', description: 'golden concentrate live resin', expectPrimary: 'Concentrates' },
  { name: 'Temple Ball Hash 2g', description: 'authentic pressed hash temple balls', expectPrimary: 'Hash' },
  { name: 'Bulk Distillate Liter', description: 'wholesale bulk distillate oil', expectPrimary: 'Concentrates' },
  { name: 'Gummy Bears 600mg', description: 'edible thc infused gummy candy', expectPrimary: 'Edibles' },
  { name: 'Lemon Haze Vape Cart 1ml', description: '510 thread cart', expectPrimary: 'Vapes' },
  // Edible false positive test (strain word + non edible tokens should remain Flower)
  { name: 'Gelato Kush 3.5g', description: 'premium hybrid strain dense buds', expectPrimary: 'Flower' },
  // Paraphernalia override
  { name: 'Glass Bong 12"', description: 'borosilicate bong for smoking', expectPrimary: 'Other' },
];

function fmtList(list?: string[]) { return Array.isArray(list) ? list.join(', ') : ''; }

export async function runUnifiedCategorizationRegressions() {
  console.log(`\n[categorization:unified] Running ${cases.length} regression cases`);
  let pass = 0; let fail = 0; const details: string[] = [];

  for (const c of cases) {
    const { primary, subcategories } = categorize(c.name, c.description || '');
    const okPrimary = (primary || null) === c.expectPrimary;
    const wantSub = (c.expectSub || []).sort();
    const gotSub = (subcategories || []).filter(Boolean).sort();
    const okSub = wantSub.length ? (JSON.stringify(gotSub) === JSON.stringify(wantSub)) : true;
    const ok = okPrimary && okSub;
    if (ok) pass++; else fail++;
    const icon = ok ? '✔' : '✖';
    const mismatch = ok ? '' : ` (primary: want=${c.expectPrimary} got=${primary || null}; sub: want=[${fmtList(wantSub)}] got=[${fmtList(gotSub)}])`;
    details.push(`[${icon}] ${c.name}${c.note ? ' — ' + c.note : ''}${mismatch}`);
  }

  for (const line of details) console.log(line);
  console.log(`[categorization:unified] Result: ${pass} passed, ${fail} failed.`);
  return { pass, fail, total: pass + fail };
}

if (require.main === module) {
  runUnifiedCategorizationRegressions().then(({ fail }) => process.exit(fail ? 1 : 0));
}
