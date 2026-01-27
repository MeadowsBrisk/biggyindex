#!/usr/bin/env ts-node
// Aggregated categorization regression suite (unified structure)
// Merged from legacy test scripts. Ensures parity while rules are ported.

import { categorize } from '../shared/categorization/index';
import { isTipListing } from '../shared/categorization/util/exclusions';

interface Case { name: string; desc: string; expectPrimary: string; expectSub?: string; }

// Flower refinement & misclassification corrections
const flowerRefine: Case[] = [
  { name: 'Rosin Huevos Fried Egg', desc: "Rosin The latest creation from the kitchen of Hassans, flavour bomb Huevos. This creates a beautiful 'fried egg' using 2 rosin strains.", expectPrimary: 'Concentrates' },
  { name: 'PJ1 Static Sift', desc: 'PJ#1 Payton x Jealousy #1 offers a unique blend of genetics static sift dry sift', expectPrimary: 'Hash' },
  { name: 'Cartier Hash', desc: 'Cartier Hash cross between a Master Kush selected for vigor and resistance', expectPrimary: 'Hash' },
  { name: 'Hassans 6* Cold Cure', desc: 'Hassans 6* cold cure wpff. Pretty much piatella fresh batch new strains classic rosin', expectPrimary: 'Concentrates' },
  { name: 'Bear Dance Hash', desc: 'Bear Dance Hash sativa-dominant hybrid', expectPrimary: 'Hash' },
  { name: 'Shatter Cali Import', desc: 'Premium Shatter import from California Kush Mintz hybrid strain', expectPrimary: 'Concentrates' },
  { name: 'Cosmic Gelato Piatella Hash', desc: 'Cosmic Gelato - Piatella Hash equal indica sativa hybrid piatella', expectPrimary: 'Hash' },
  { name: 'Titanic Hash', desc: 'Titanic Hash indica dominant hybrid white fire x tres stardawg', expectPrimary: 'Hash' },
  { name: 'Z3 Dry Filtered', desc: 'Z3 Hybrid - Dry filtered dry-filtered', expectPrimary: 'Hash' },
  { name: 'Simpson Kush Hash', desc: 'Simpson Kush indica strain genetics SFV OG F.O.G lineage', expectPrimary: 'Hash' },
  { name: 'Banana OG Kush Hash', desc: 'Banana OG Kush Hash distinctive pine citrus aroma OG KUSH HASH', expectPrimary: 'Hash' },
  { name: 'Eddys RSO', desc: 'Eddys Rso batch limited stock rso', expectPrimary: 'Concentrates' },
  { name: 'Fresh RSO Gelato Haze', desc: 'Fresh RSO (GELATO x HAZE) potent rso', expectPrimary: 'Concentrates' },
  { name: 'Orange Diesel Terp Sauce', desc: 'Orange Diesel Terp Sauce agent orange sour diesel terp sauce live resin', expectPrimary: 'Concentrates' },
  { name: 'Lemon Zkittlez Crystalline', desc: 'Lemon Zkittlez Crystalline hybrid crystalline diamonds thca', expectPrimary: 'Concentrates' },
  { name: 'Cereal Gas Sugar', desc: 'Cereal Gas Sugar evenly balanced hybrid strain sugar diamonds', expectPrimary: 'Concentrates' },
  { name: 'Lemon Haze Hash', desc: 'Lemon Haze Hash sativa dominant hybrid hash', expectPrimary: 'Hash' },
  { name: 'Gelat.OG Hash', desc: 'Gelat.OG Hash indica dominant hybrid hash', expectPrimary: 'Hash' },
  { name: '1G Resale Pots', desc: '1G labeled resale pots for resale resale pots', expectPrimary: 'Concentrates' },
  { name: 'Gelato 41 Wax Crumble', desc: 'Gelato 41 Wax Crumble 90% THC wax crumble', expectPrimary: 'Concentrates' },
  { name: 'Zkittlez Concentrate', desc: 'Zkittlez Concentrate 90% THC concentrate', expectPrimary: 'Concentrates' },
  { name: 'Purple Punch Concentrate', desc: 'Purple Punch Concentrate 90% THC concentrate', expectPrimary: 'Concentrates' },
  { name: 'Biscotti Wax Resin Concentrate', desc: 'Biscotti Wax Resin Concentrate wax rosin concentrate', expectPrimary: 'Concentrates' },
  { name: 'Honey Comb Badder', desc: 'Honey Comb Badder hybrid badder batter concentrate', expectPrimary: 'Concentrates' },
];

// Preroll refinement
const prerollRefinement: Case[] = [
  { name: 'Mac Melon Shake 🍈 ❄️', desc: '**out of stock so we will ship the ultimate Preroll quality shake** ALIEN OG SUPER FIRE POTENT SHAKE', expectPrimary: 'Flower', expectHasPreRolls: false },
  { name: '*THAI WEED* THAI-STICK 20% EXTRA - FREE SHIPPING', desc: 'Thai Weed, Also Known As Thai Stick, compressed block distinctive smell energetic', expectPrimary: 'Flower', expectHasPreRolls: false },
  { name: 'Mixed small bud/dust/shake', desc: 'Includes small pea size nuts perfect for blunts, edibles, concentrates,dry vape or even mixed with tobacco to smoke a joint!', expectPrimary: 'Flower', expectHasPreRolls: false },
  { name: 'HIGH THC TRIM X SHAKE *FREE SHIPPING*', desc: 'This is perfect for extracting, cooking or topping up your joint. Best value for money', expectPrimary: 'Flower', expectHasPreRolls: false },
  { name: 'Ultimate Preroll Quality Shake - Kushmints', desc: 'Absolutely dank shake Perfect for smoking Perfect shake in house UK grown Kushmints', expectPrimary: 'Flower', expectHasPreRolls: false },
  { name: 'Thai Stick Natural Mellow Weed', desc: 'Great bit of Thai weed Sungrown Organic nice mellow puff', expectPrimary: 'Flower', expectHasPreRolls: false },
  // PreRolls is now a top-level category
  { name: '5 Pack Premium Pre-Rolls', desc: 'Five pre-rolled joints in a sealed pack hand rolled cones', expectPrimary: 'PreRolls', expectSubcategory: 'Packs' },
];

// Edible sauce refinement
const edibleSauce: Case[] = [
  { name: 'Wonky sauce 1000mg ⚠️', desc: '**NEW** Extremely potent gourmet sauce!! Oompa Loompas biggest secret wonky sauce chocolate candy gourmet 1000mg', expectPrimary: 'Edibles' },
  { name: 'Eddys Edibles', desc: 'True dose edibles from my original shop now all in one place. Hand made edibles made not sprayed in house.', expectPrimary: 'Edibles' },
  { name: 'Orange Diesel Terp Sauce', desc: 'Orange Diesel Terp Sauce live resin terp sauce diamonds potent extract', expectPrimary: 'Concentrates' },
];

// Distillate / tincture refinement
const distillateRefine: Case[] = [
  { name: '[UK-UK/NI] D9 Distillate - 98%+ 10ml-100ml', desc: 'Welcome to our listing for D9 Distillate bulk jars', expectPrimary: 'Concentrates' },
  { name: 'distillate d9', desc: 'high quality distillate d9 maybe little less then 10ml', expectPrimary: 'Concentrates' },
  { name: 'Top Tier Cat 3 D9 Distillate - No pesticides/heavy meta', desc: 'Best ticket Highest quality Distillate 50ml syringe', expectPrimary: 'Concentrates' },
  { name: 'D9+Terpenes', desc: 'D9 + Terp Syringes Pre Mixed fill your own vapes', expectPrimary: 'Concentrates' },
  { name: '1L of 96%THC D9 Distillate', desc: 'Same distillate that goes into our vapes and edis spare jars', expectPrimary: 'Concentrates' },
  { name: '5ml Delta 9 syringes with 10% Botanical Terps', desc: 'Delta 9 botanical terps 5ML Syringes', expectPrimary: 'Concentrates' },
  { name: 'D9 Distillate', desc: 'D9 Distillate from California bulk', expectPrimary: 'Concentrates' },
  { name: 'Lemonchillo 800mg -40% alcohol - 400ml', desc: '800mg D9 - 40% alcohol lemoncello style liquor not for vaping', expectPrimary: 'Other' },
  { name: 'Pumpjack wellness oil: TCH & CBD', desc: 'FOR ORAL APPLICATIONS ONLY DO NOT SMOKE OR VAPE MCT Oil drops', expectPrimary: 'Tincture' },
  { name: 'Premium Distillate D9 Cartridges ***510 thread', desc: 'Premium Delta 9 Distillate 95%+ THC blended terpenes 510 thread cartridges', expectPrimary: 'Vapes' },
];

// New regressions & paraphernalia
const newRegressions: Case[] = [
  { name: 'Flavour Packs - Raw Cones/Pre rolls', desc: 'try my strains Moonrocks joints rolled with pure weed', expectPrimary: 'PreRolls' },
  { name: 'Mad Honey', desc: 'Mad honey directly from Nepal potent harvest', expectPrimary: 'Other' },
  { name: 'THC Chocolate Bars 🌿 420mg', desc: 'In-house Made Chocolate Bars 420mg total pieces Delta 9 THC Distillate', expectPrimary: 'Edibles' },
  { name: 'Glass Bong 12"', desc: 'borosilicate bong for smoking', expectPrimary: 'Other', expectSub: 'Bongs' },
  { name: 'GELATO 41 FIRE TRIM', desc: 'FULL OF POP CORN AND SUGAR LEAF', expectPrimary: 'Flower', expectSub: 'Shake' },
];

// Vape overrides (sample subset)
const vapeOverrides: Case[] = [
  { name: 'Premium Distillate D9 Cartridges ***510 thread', desc: 'Premium Delta 9 Distillate cartridges 510 thread', expectPrimary: 'Vapes' },
  { name: 'Extract Vape Cart 1ml (510 Thread)', desc: 'extract vape cart sugar wax 1ml 510 thread', expectPrimary: 'Vapes' },
];

// User-listed fixes batch 2 (subset)
const userListed2: Case[] = [
  { name: 'Premium Drysift', desc: 'triple filtered premium dry zkittlez cake drysift', expectPrimary: 'Hash' },
  { name: 'Buttonless Battery', desc: 'PALM PRO hands-free Battery quantities listed', expectPrimary: 'Vapes', expectSub: 'Battery' },
  { name: '24x0.5ml cartridges', desc: 'cartridges in stock GELATO KUSH ZKITTLES MIMOSA GRAPE APE', expectPrimary: 'Vapes', expectSub: 'Cartridge' },
];

// Edibles various (subset)
const ediblesMisc: Case[] = [
  { name: 'Canna Honey', desc: 'Cannabis Honey made from small buds mixed strains infused', expectPrimary: 'Edibles' },
  { name: 'Cannabis Nutella', desc: 'Cannabis Nutella made from mixed buds infused', expectPrimary: 'Edibles' },
  { name: 'Cannabis coconut oil', desc: 'Super strong Cannabis coconut oil mixed strains', expectPrimary: 'Edibles' },
];

// Tincture / Cannadrops / AccuDose branded products
const tinctureProducts: Case[] = [
  { name: "Kush 'n' Cookies CBD 1:1 Cannadrops", desc: "A truly balanced medicinal strain with an impressive lineage, OG Kush x Girl Scout Cookies genetics resulted in a 50/50 indica / sativa strain with an almost equal amount of THC & CBD averaging 16% – 21% of each.", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "FECO blend 1:1 ratio Cannadrops", desc: "More potent than the whole plant infusions, these drops are made from full extract cannabis oil (FECO) with added peppermint oil. Infused with equal amounts of THC & CBD, these 1:1 ratio drops provide strong pain relief", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "FECO blend 10:1 ratio Cannadrops", desc: "More potent than the whole plant infusions, these drops are made from full extract cannabis oil (FECO) with added peppermint oil. Infused at a ratio of 10:1 THC:CBD, these drops offer strong neurological pain relief", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "Night Nurse Cannadrops", desc: "My own blend of the potent Sleepy Joe that was harvested to produce extra sedative CBN cannabinoids. Infused with Bubba Kush CBD, a relaxing, pain-relieving high CBD indica with around 16% CBD and less than 1% THC", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "Kush Mintz Cannadrops", desc: "Animal Mintz x Bubba Kush x Original Sensible Seeds Secret Hybrid. A mouth-watering cookie mint flavour strain which is 80% indica & 20% sativa averaging 20 – 25% THC. This strain is all about the body stone & clear-headed effects.", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "Day Nurse Cannadrops", desc: "My own blend of 3 different types of cannabis – 50% of Lemon CBD 1:1 (~17% THC, ~17% CBD), 25% of Pineapple Cookie Dough CBD (~13% CBD, <1% THC) and 25% of Amnesia haze (~20% THC). The strains have been chosen due to their uplifting terp…", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "AccuDose© 5000mg Live Resin Tincture - Gold Standard", desc: "Hello it's Mary We decided to put more focus on our 5000mg droppers They provide 10x the potency and duration of use in comparison to the 500mg counterpart 370 drops on the bottle means each drop will have a very healthy dose", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
  { name: "AccuDose© Live Fast Acting Sublingual Tincture 500MG", desc: "AccuDose© A Brand By Hemp Lady Focussing on accurate THC dosing for medical patients and using best ingredients for greater bioavailability and absorption. 2 Options Available 500mg Tincture Dropper or 1000mg", expectPrimary: 'Tincture', expectSub: 'Sublingual' },
];

// Psychedelics - Magic Gummies (LSD gummies vs cannabis gummies)
const psychedelicProducts: Case[] = [
  { name: "Magic Gummies", desc: "Hello, fellow adventure seekers ;) We bring you our new Magic Gummies, each of them contains 100ug. Packs of 5. Please exercise caution and harm reduction practices when taking these! - CityCartel City products.", expectPrimary: 'Psychedelics', expectSub: 'Paper' },
  // Ensure regular gummies still go to Edibles
  { name: "THC Gummies 500mg", desc: "Delicious cannabis infused gummy bears, 500mg THC total, 10 pieces per pack", expectPrimary: 'Edibles' },
];

const allCases: Case[] = [
  ...flowerRefine,
  ...prerollRefinement,
  ...edibleSauce,
  ...distillateRefine,
  ...newRegressions,
  ...vapeOverrides,
  ...userListed2,
  ...ediblesMisc,
  ...tinctureProducts,
  ...psychedelicProducts,
];

function run() {
  let fail = 0;
  // Exclusion sanity checks (from legacy test-exclusions.js)
  const excl = [
    { name: "Todd's Referrer Retirement Plan", desc: 'sharing links of your favorite topics...', expect: true },
    { name: 'Biggy Star Maker Package', desc: 'I\'ll work with you to get real results quickly...', expect: true },
    { name: 'Postage upgrade', desc: 'To upgrade to special delivery after an order', expect: true },
    { name: 'Shipping upgrade', desc: 'Upgrade to express delivery after checkout', expect: true },
    { name: 'UK Runtz', desc: 'Candy-coated euphoria with a silky OG core.', expect: false },
  ];
  for (const e of excl) {
    const got = isTipListing(e.name, e.desc);
    const ok = got === e.expect;
    if (!ok) fail++;
    console.log(`${ok ? 'OK' : 'FAIL'} | isTipListing("${e.name}") => ${got} expected ${e.expect}`);
  }
  for (const c of allCases) {
    const { primary, subcategories = [] } = categorize(c.name, c.desc);
    const okPrimary = primary === c.expectPrimary;
    const subOk = c.expectSub ? subcategories.includes(c.expectSub) : true;
    const ok = okPrimary && subOk;
    if (!ok) fail++;
    const detail = `primary=${primary} subs=[${subcategories.join(',')}]`;
    console.log(`${ok ? 'OK' : 'FAIL'} | ${c.name} => ${detail} expected=${c.expectPrimary}${c.expectSub?` sub=${c.expectSub}`:''}`);
  }
  console.log(`\n[categorization:all] Completed cases=${allCases.length} failed=${fail}`);
  if (fail) process.exit(1);
}

if (require.main === module) run();
export { run as runAllCategorizationTests };
