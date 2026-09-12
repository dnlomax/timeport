// Era presets. Each era is three coordinated pieces of prose:
//
//   restyle   — instruction for the image-edit model that turns a present-day
//               street-level photo into a period photo of the same street.
//   world     — the LingBot World 2 prompt. Paragraph-length with explicit
//               camera framing; short prompts make the stream unstable.
//   liveEdit  — the SANA-Streaming edit prompt applied to LingBot's output
//               when the live period filter is on. Names only what changes.
//
// The three must agree: the seed frame, the world model's idea of the world,
// and the live filter all describe the same decade or the stream fights itself.

export interface EraPreset {
  id: string;
  label: string;
  /** Shown in the picker under the label. */
  blurb: string;
  restyle: string;
  world: string;
  liveEdit: string;
}

const STRUCTURE_RULE =
  "Keep the exact camera position, lens, perspective and building geometry of the source photo. " +
  "Every building footprint, roofline, window opening and street width must stay where it is. " +
  "Do not invent new streets, do not move the horizon, do not change the time of day. " +
  "Change only what would have looked different in the period.";

export const ERAS: EraPreset[] = [
  {
    id: "1900s",
    label: "1900s",
    blurb: "Horse-drawn, gas-lit, wet plate",
    restyle:
      `Rephotograph this street as it would have appeared in the 1900s. ${STRUCTURE_RULE} ` +
      "Remove all motor vehicles, road markings, traffic lights, modern signage, satellite dishes, " +
      "plastic, aluminium shopfronts and overhead power cables. Add horse-drawn carts and carriages, " +
      "cast-iron gas street lamps, painted wooden shop fascias, awnings, and pedestrians in long coats " +
      "and hats. Cobbled or macadam road surface. Render as a period photograph: monochrome with a " +
      "warm sepia-brown tone, orthochromatic response (skies blown out, red tones dark), slow shutter " +
      "so moving figures blur slightly, soft corners and light vignetting, fine silver grain.",
    world:
      "A first-person walk down a 1900s city street, captured as a sepia-toned period photograph come to life. " +
      "Horse-drawn carts stand at the kerb, cast-iron gas lamps line the pavement, painted wooden shop fascias " +
      "and cloth awnings run along the frontages, and pedestrians in long coats and hats cross the cobbled road. " +
      "The camera is at walking eye height, held steady and level, moving forward at an unhurried pace, framing " +
      "the street as a corridor between building facades with the roadway receding into the distance. " +
      "Monochrome sepia, orthochromatic tonality with a bright blown-out sky, soft lens corners, fine silver grain, " +
      "and the gentle motion blur of a slow period exposure.",
    liveEdit:
      "Make this a 1900s sepia-toned period photograph: monochrome warm sepia, blown-out sky, " +
      "soft vignetted corners, fine silver grain. Keep the street, buildings and camera motion unchanged.",
  },
  {
    id: "1920s",
    label: "1920s",
    blurb: "Model T traffic, enamel signs",
    restyle:
      `Rephotograph this street as it would have appeared in the 1920s. ${STRUCTURE_RULE} ` +
      "Remove all modern cars, road markings, traffic lights, LED and plastic signage, satellite dishes, " +
      "double glazing and modern street furniture. Add boxy black 1920s motor cars with running boards and " +
      "spoked wheels, enamel advertising signs, hand-painted shop fascias, striped awnings, and pedestrians in " +
      "cloche hats, flat caps and long overcoats. Add tram or trolley wires only if the street already has poles. " +
      "Render as a period photograph: black and white with a faint warm tone, strong contrast, slight halation " +
      "around bright highlights, visible film grain, and gentle corner softness from an uncoated lens.",
    world:
      "A first-person walk down a 1920s city street, rendered as black-and-white period newsreel footage. " +
      "Boxy black motor cars with running boards and spoked wheels pass along the roadway, enamel advertising " +
      "signs and hand-painted fascias cover the shopfronts, striped awnings shade the pavement, and pedestrians " +
      "in cloche hats, flat caps and long overcoats move along the kerb. The camera sits at walking eye height, " +
      "level and steady, advancing smoothly down the middle of the street with building facades framing both " +
      "sides and the road receding to a distant vanishing point. Black and white with a faint warm tone, high " +
      "contrast, halation around bright highlights, and continuous fine film grain.",
    liveEdit:
      "Make this 1920s black-and-white newsreel footage: fully desaturated high-contrast monochrome, no colour " +
      "cast, halation around highlights, heavy film grain and dust. Keep the street, buildings and camera " +
      "motion unchanged.",
  },
  {
    id: "1950s",
    label: "1950s",
    blurb: "Chrome fins, neon, Kodachrome",
    restyle:
      `Rephotograph this street as it would have appeared in the 1950s. ${STRUCTURE_RULE} ` +
      "Remove all modern cars, LED signage, plastic shopfronts, satellite dishes and contemporary street furniture. " +
      "Add rounded 1950s automobiles with chrome bumpers and whitewall tyres, painted metal and early neon signs, " +
      "canvas awnings, and pedestrians in tailored coats and hats. Render as an early colour photograph: " +
      "Kodachrome palette with dense reds and cyan-leaning shadows, slightly muted overall saturation, " +
      "mild colour fringing, visible grain, and the softness of a period lens.",
    world:
      "A first-person walk down a 1950s city street, shot on early Kodachrome colour film. Rounded automobiles " +
      "with chrome bumpers and whitewall tyres line the kerb, painted metal and early neon signs hang over the " +
      "shopfronts, canvas awnings shade the pavement, and pedestrians in tailored coats and hats pass by. " +
      "The camera is at walking eye height, level and steady, moving forward at a relaxed pace with the facades " +
      "framing the street and the roadway receding ahead. Dense reds, cyan-leaning shadows, slightly muted " +
      "saturation, mild colour fringing, soft period optics and fine grain throughout.",
    liveEdit:
      "Grade this as 1950s Kodachrome film: dense reds, cyan-leaning shadows, muted saturation, mild colour " +
      "fringing and fine grain. Keep the street, buildings and camera motion unchanged.",
  },
  {
    id: "1970s",
    label: "1970s",
    blurb: "Faded Ektachrome, boxy sedans",
    restyle:
      `Rephotograph this street as it would have appeared in the 1970s. ${STRUCTURE_RULE} ` +
      "Remove all modern cars, LED and digital signage, uPVC windows, satellite dishes and contemporary bollards. " +
      "Add boxy 1970s sedans in brown, orange and avocado, plastic and backlit shop signage of the period, " +
      "and pedestrians in flared trousers and wide collars. Render as a faded 1970s colour snapshot: " +
      "warm yellow-orange cast, lifted milky blacks, reduced contrast, slight magenta shift in the highlights, " +
      "heavy grain and the soft focus of a consumer camera.",
    world:
      "A first-person walk down a 1970s city street, captured on faded consumer colour film. Boxy sedans in " +
      "brown, orange and avocado are parked along the kerb, backlit plastic shop signage runs along the " +
      "frontages, and pedestrians in flared trousers and wide collars move along the pavement. The camera is " +
      "at walking eye height, level and steady, advancing down the street with facades on both sides and the " +
      "roadway receding ahead. Warm yellow-orange cast, milky lifted blacks, low contrast, a magenta shift in " +
      "the highlights, heavy grain and soft consumer-lens focus.",
    liveEdit:
      "Grade this as faded 1970s consumer colour film: warm yellow-orange cast, milky lifted blacks, low " +
      "contrast, magenta highlights and heavy grain. Keep the street, buildings and camera motion unchanged.",
  },
];

export const DEFAULT_ERA_ID = "1920s";

export function eraById(id: string): EraPreset {
  return ERAS.find((e) => e.id === id) ?? ERAS[0];
}
