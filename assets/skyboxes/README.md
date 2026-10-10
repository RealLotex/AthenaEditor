# Sky panorama source assets

Updated October 10, 2026. The library again uses the ten original stylized **single_image** panoramas, each **1774 × 887**, without reconstruction or enlargement of the source files. Exact copies remain in `illustrated/`; `sources.json` records their dimensions and hashes. The larger photographic/reconstructed versions are outside the shipped library. Further resolution improvements are deferred.

`deno run -A tools/generate-skyboxes.js` packs a separate 1024 × 512 indexed preview and preserves the source resolution at the GS's RGB555 precision. Conversions use that original directly. Larger output settings resample the 1774 × 887 source and warn that they add no detail; they do not represent a higher-resolution original. The source payload shrank from 29,569,536 to 9,817,778 bytes.

## Original illustration references

The following briefs and `prompts.json` document the previous built-in image-generation outputs used as references. The original briefs are retained in `prompts.json`.

Shared prompt: production seamless full-sphere equirectangular 360° × 180° sky, exact 2:1 ratio, equator at image midpoint, clouds distributed around all longitudes at small angular scale, uniform poles, vibrant detailed painted volumetric atmosphere. No terrain, buildings, water, text, borders or watermarks. Intended view angle: 90–100°.

- **clear.png**: Tropical cobalt-blue daytime sky, sculptural towering white cumulus clusters with warm sunlit ivory edges and rich blue undersides. Clouds distributed around ALL longitude directions, each cluster SMALL angular size 10-20 degrees, abundant blue open sky overhead; a thin distant cloud bank exactly on equator. Vibrant late-1990s tropical adventure game atmosphere.
- **clouds.png**: Brilliant azure blue sky with many detailed layered white cumulus cloud islands, luminous silver edges, cool blue shadows, clouds cover half the upper hemisphere but clear pockets between, distant small clouds at the equatorial horizon. Dramatic vivid game atmosphere.
- **golden.png**: Spectacular golden hour sky: deep teal-blue zenith, warm honey sunlit small cumulus formations with deep indigo shadows, saturated amber and peach equatorial horizon, a small low sun to one side with subtle glow. Elegant dramatic contrast.
- **sunset.png**: Vivid tropical sunset sky: deep violet upper sky, sculpted scattered magenta and coral cloud bands with glowing orange edges, fiery tangerine thin equatorial horizon, small sun near horizon. Rich contrast, expansive atmosphere.
- **dusk.png**: Luminous blue hour sky: deep ultramarine zenith, layered lavender cloud islands outlined in pink, cool turquoise and rose horizon at equator, subtle stars emerging above. Moody but vivid and readable.
- **night.png**: Detailed midnight panorama: deep navy starry sky, delicate Milky Way arc occupying many directions, small luminous full moon above equator to one side, distant cobalt cloud bank with silver edges on equator. Dense tiny stars, pronounced tonal contrast.
- **aurora.png**: Breathtaking northern lights: luminous green and turquoise sweeping aurora curtains with detailed vertical light filaments and subtle violet tips, small full moon to one side, starry deep navy sky, dark layered blue cloud banks low around the equatorial horizon. Strong bright green against navy contrast, like aurora above cloud sea.
- **storm.png**: Epic storm sky: monumental but distant slate blue thundercloud clusters, luminous white cloud edges, dark indigo cloud undersides, contrasting shafts of warm sunshine through openings, patches of intense cobalt blue. Thin distant equatorial cloud bank, dramatic tonal contrast.
- **desert.png**: Brilliant desert atmosphere: saturated sapphire zenith, turquoise sky, pale gold thin equatorial haze, scattered crisp ivory cumulus clusters with warm illuminated edges and blue shadows, small bright sun. Wide open dramatic sky; NO sand, terrain or dunes.
- **space.png**: Rich cosmic panorama: electric cyan and deep violet interstellar nebula wisps distributed around whole sphere, dense pinpoint stars, vivid magenta luminous dust filaments contrasted against near-black navy voids; tiny distant celestial bodies only. Immersive cosmic game environment.

Final tile conversion closes the longitude seam and pole texels. The 2048 slider produces a 4096 × 2048 full panorama in eight 1024² tiles, or four 1024² tiles when omitting the lower hemisphere. Indexed tiles share a palette and matching border pixels. No image service is required to reproduce the embedded library.
