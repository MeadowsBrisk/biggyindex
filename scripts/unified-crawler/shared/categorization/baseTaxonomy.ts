// Faithful TypeScript port of legacy taxonomy (no behavioural changes)
export type Taxonomy = {
  [parent: string]: { keywords: string[]; children: Record<string, string[]> };
};

export const TAXONOMY: Taxonomy = {
  Tips: { keywords: ["tip jar", "tip", "tips"], children: {} },
  Flower: {
    keywords: [
      "flower","bud","buds","budds","nug","nuggs","nugs","haze","hybrid","tops","rs11","budget","mids","shake","trim","popcorn","zkittlez","zkittles","diesel","marijuana","strain","strains","indica","sativa","exotic","exotics","cali","puffport","cookies","runtz","sherb","sherbert","sherbet","cake","blueberry","cheese","trainwreck","wedding","mochi","gumball","limoncello","indoor","outdoor","greenhouse","dawg","stardawg","chemdawg","gelato","gelatti","strawberry banana","brian berry cough","do si dos","dosidos","dosi dos","zoap","skittles","mac 1"
    ],
    children: {
      Haze: ["haze"],
      Kush: ["kush"],
      rs11: ["rs11"],
      Zkittlez: ["zkittlez","zkittles","skittles"],
      OG: [" og ","og "],
      Diesel: ["diesel"],
      Shake: ["shake","trim","popcorn","sugar leaf","sugarleaf"],
      PreRolls: [
        "pre-roll","pre-rolls","pre roll","pre rolls","preroll","prerolls","prerolled","pre-rolled","pre rolled",
        "joint","joints","blunt","blunts","spliff","spliffs","hand rolled","hand-rolled","cone","cones","stick","sticks"
      ],
      Imported: [
        "dispensary jar","dispensary jars","dispensary pack","dispensary packs","3.5g pack","jungle boys","alien labs","wizard trees","doja","connected","the ten co","don merfos","cali","california","imported directly","directly imported","imported loose"
      ],
      Landrace: ["landrace","landraces","thai stick","thai sticks","red string","brick","brick weed","ital"],
      Exotics: ["exotic","exotics"],
      Smalls: ["smalls","small nugs","smaller nugs","neglected nugs","spares","clearance"]
    }
  },
  Hash: {
    keywords: [" hash ","hashish","hashes","moroccan","charras","temple ball","temple balls","blonde","bubble","polm","mousse","mousse hash","static hash","static sift","sift","dry filtered","dry-filtered","drysift","static","frozen","sift","kief","pollen","moonrock","moonrocks","moon rock","moon rocks","unpressed","dipped","powdery","black","dry sift","dry-sift","triple filtered","triple-filtered","triple sifted","3x filtered","3x","x3","120u","120 micron","120 microns","120µ","120μ","piatella","simpson kush"],
    children: {
      Moroccan: ["moroccan"],
      Mousse: ["mousse","mousse hash"],
      Blonde: ["blonde"],
      Charras: ["charras","charas"],
      Bubble: ["bubble"],
      TempleBall: ["temple ball","temple balls"],
      Static: ["static hash","static sift"],
      Frozen: ["frozen"],
      Kief: ["kief","pollen","unpressed","powdery"],
      Moonrocks: ["moonrock","moonrocks","moon rock","moon rocks","dipped"],
      DrySift: ["dry sift","dry-sift","drysift","sift","dry filtered","dry-filtered","drytek","dry tek"],
      Black: ["black"],
      TripleFiltered: ["triple filtered","triple-filtered","triple sifted","3x filtered","3x","x3"],
      "120u": ["120u","120 micron","120 microns","120µ","120μ"],
      "90u": ["90u","90 micron","90 microns","90µ","90μ"],
      Piatella: ["piatella"],
    }
  },
  Tincture: {
    keywords: [
      'tincture','tinctures','sublingual','oral spray','sublingual spray','spray tincture','tincture spray','live resin tincture','resin spray','oral','fast acting', 'cannadrops'
    ],
    children: {
      Spray: ['spray','spray tincture','tincture spray','oral spray','sublingual spray'],
      Sublingual: ['sublingual','sublingual spray'],
      LiveResin: ['live resin tincture','resin spray'],
    }
  },
  Vapes: {
    keywords: [
      "vape","vapes","disposable","disposables","carts","cart","cartridge","cartridges","thc liquid","device","pod","pen","pens","d9","delta 9","delta-9","delta9","live resin","battery","510","510 thread"
    ],
    children: {
      Disposable: ["disposable","disposables","device"],
      Cartridge: ["cart","carts","cartridge","cartridges","pod","pen","pens","510","510 thread"],
      Distillate: ["distillate","distilate","d9","delta 9","delta-9","delta9"],
      LiveResin: ["live resin"],
      Battery: ["battery"],
    }
  },
  Concentrates: {
    keywords: ["concentrate","concentrates","extract","extracts","wax","badder","isolate","batter","sugar","crumble","shatter","slab","diamonds","rosin","rso","oil","distillate","distilate","delta 8","delta 9","delta","sauce","terp sauce","terpene sauce","live resin","piatella","cold cure","cold-cure","6*","6 star","6star","six star","wpff","crystalline","crystal","thca","thc-a","resale pots"],
    children: {
      Wax: ["wax","crumble"],
      Shatter: ["shatter","slab"],
      Rosin: ["rosin"],
      RSO: ["rso"],
      Oil: ["oil","live resin","sauce","terp sauce","terpene sauce","badder","batter"],
      Sugar: ["sugar","diamonds","crystalline","crystal","thca","thc-a"],
      Piatella: ["piatella","cold cure","cold-cure","6*","6 star","6star","six star","wpff"],
      Distillates: ["distillate","distilate","delta 8","delta 9","delta"],
      Pots: ["resale pots","labeled pots","labelled pots"],
    }
  },
  Edibles: {
    keywords: [
      "edible","edibles","wonky bar","brownie","capsule","capsules","tablet","tablets","gummy","gummies","chocolate","chocolates","wonka","cubes","chunks","sugar-coated","sugar coated","cluster","nerd rope","nerd ropes","cereal bar","coconut oil","cannabutter","canna butter","canna chocolate","milk","belgian","coconut oil capsules","angel delight","rolos","rolo","candy","sweets","drops","candy drops","pineapple chunks","pineapple","cola cubes","cola","bears","bear","gummy bear","gummy bears","happy bears","nerd","infused","vegan","vegan-friendly","caps","capsules","canna coconut oil","cannabis oil","cannabis-infused","cannabis infused","nutella","cannabis nutella","canna nutella","honey","canna honey","cannabis honey","chew","chews","cheeba chews"
    ],
    children: {
      Chocolate: ["chocolate","chocolates","wonky bar","canna chocolate","belgian","milk"],
      Gummies: ["gummy","gummies","gummy bear","gummy bears","happy bears","bears"],
      Capsules: ["capsule","capsules","caps","coconut oil capsules","tablet","tablets","cola cubes","cubes"],
      Candy: ["candy","sweet","sweets","drops","candy drops","cola","pineapple chunks","pineapple","chunks"],
      Bars: ["cereal bar"],
      ButterOil: ["cannabutter","canna butter","coconut oil","canna coconut oil"],
      Treats: ["brownie","rope","ropes","nerd rope","nerd ropes","angel delight","delight","rolos","rolo"],
      InfusedOil: ["cannabis oil","cannabis-infused","cannabis infused"],
      Spreads: ["nutella","honey","canna honey","cannabis honey","cannabis nutella","canna nutella"],
    }
  },
  Psychedelics: {
    keywords: [
      "lsd","acid","blotter","tab","dmt","ayahuasca","changa","paper","spirit","micro-doses","micro dose","microdose","microdoses","microdosing","420 this week","the deep dive","spirit vape","Leisure Time","The Deep Dive","Laser Focus","True Mic","lucy","diamonds","cubensis","penis envy","golden teacher","treasure coast","albino","grow kit","grow kits","grow your own"
    ],
    children: {
      Spirit: ["dmt","ayahuasca","420 this week","spirit vape"],
      Paper: ["lsd","acid","blotter","paper","the deep dive","420 this week","Leisure Time","The Deep Dive","Laser Focus","True Mic","lucy in","with diamonds"],
      Mushrooms: ["mushroom","mushrooms","mush","shroom","shrooms","psilocybin","psilocybe","magic mushroom","cubensis","penis envy","golden teacher","treasure coast","albino"],
      Grow: ["grow kit","grow kits","grow your own","grow-your-own","heat mat","heat mats","heatmat","flow unit","flow units","spawn","substrate"],
      Microdose: ["microdose","microdoses","micro dosing","micro-dosing","micro dose","micro-doses","microdosing"],
    }
  },
  Other: { keywords: ["mad honey","modafinil","blister","erectile","box","antibiotic","respiratory","Doxycycline"], children: { Bongs: [] } },
};

export default TAXONOMY;
