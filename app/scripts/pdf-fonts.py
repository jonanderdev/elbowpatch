"""Fixed font files for the PDF: made by pdf-fonts.mjs, which calls this. Needs fonttools.

Each file is one face of the printed page at one weight and optical size, for one group of scripts:
Latin with its extended accents and Vietnamese (so one word never needs two files), Cyrillic with its
extension, or Greek with its extension. The PDF writer cannot embed a variable font at a weight, which
is why these are made here and committed. coverage.json lists the characters each file holds, so the
PDF code knows which files a piece needs before it fetches any.
"""

import io
import json
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

# The Latin file keeps its plain name; the others add their script.
SCRIPTS = {'latin': '', 'cyrillic': '-cyrillic', 'greek': '-greek'}
unicodes = json.load(open(unicodes_file))
FEATURES = ['kern', 'liga', 'ccmp', 'locl', 'mark', 'mkmk', 'rvrn']


def ranges(codes):
    """Sorted code points as 'from-to' hex ranges, joined by commas."""
    parts = []
    start = prev = None
    for code in sorted(codes):
        if prev is not None and code == prev + 1:
            prev = code
            continue
        if start is not None:
            parts.append(f'{start:x}' if start == prev else f'{start:x}-{prev:x}')
        start = prev = code
    if start is not None:
        parts.append(f'{start:x}' if start == prev else f'{start:x}-{prev:x}')
    return ','.join(parts)


coverage = {}
for name, (path, axes) in FACES.items():
    # recalcTimestamp off, so that making a file again gives the same bytes.
    instance = instancer.instantiateVariableFont(TTFont(path, recalcTimestamp=False), axes, inplace=False)
    for script, suffix in SCRIPTS.items():
        # Each file is cut from its own copy of the instance.
        buffer = io.BytesIO()
        instance.save(buffer, reorderTables=False)
        buffer.seek(0)
        fixed = TTFont(buffer, recalcTimestamp=False)
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
        subsetter.populate(unicodes=[int(u, 16) for u in unicodes[script].split()])
        subsetter.subset(fixed)
        file = f'{name}{suffix}'
        fixed.save(f'{out}/{file}.ttf')
        cmap = fixed.getBestCmap()
        coverage[file] = ranges(cmap.keys())
        print(file, len(cmap), 'characters')

with open(f'{out}/coverage.json', 'w') as handle:
    json.dump(coverage, handle, indent=0, sort_keys=True)
    handle.write('\n')
