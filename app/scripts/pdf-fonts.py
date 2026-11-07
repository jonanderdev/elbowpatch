"""Fixed font files for the PDF: made by pdf-fonts.mjs, which calls this. Needs fonttools.

Each file is one face of the printed page at one weight and optical size, with Latin, its extended
accents and Vietnamese in it (so one word never needs two files). The PDF writer cannot embed a
variable font at a weight, which is why these are made here and committed.
"""

import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

literata, literata_italic, eb_garamond, unicodes_file, out = sys.argv[1:6]

# name: (source, axes). The optical size is in CSS px, as the browser sets it, the same number the
# layout uses (src/pdf/layout.ts): 11pt is 14.667px, 8.5pt is 11.333px.
FACES = {
    'literata-360': (literata, {'wght': 360, 'opsz': 14.667}),
    'literata-300-title': (literata, {'wght': 300, 'opsz': 60}),
    'literata-600': (literata, {'wght': 600, 'opsz': 14.667}),
    'literata-600-initial': (literata, {'wght': 600, 'opsz': 72}),
    'literata-italic-400': (literata_italic, {'wght': 400, 'opsz': 11.333}),
    'eb-garamond-italic-400': (eb_garamond, {'wght': 400}),
    'eb-garamond-italic-600': (eb_garamond, {'wght': 600}),
}

unicodes = [int(u, 16) for u in open(unicodes_file).read().split()]
FEATURES = ['kern', 'liga', 'ccmp', 'locl', 'mark', 'mkmk', 'rvrn']

for name, (path, axes) in FACES.items():
    fixed = instancer.instantiateVariableFont(TTFont(path), axes, inplace=False)
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = False
    options.notdef_outline = True
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    options.glyph_names = False
    options.drop_tables += ['STAT']
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(fixed)
    fixed.save(f'{out}/{name}.ttf')
    print(name, len(fixed.getBestCmap()), 'characters')
