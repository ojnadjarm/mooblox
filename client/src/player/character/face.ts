import { box, mirrored, shade, type Part } from './parts';

const FRONT = 0.4;
const EYE_X = 0.19;
const EYE_Y = 2.24;
const EYE = 0.2;

const ROSE = 0xff7f8f;

/** The skin tone pulled towards rose: cheeks that stay warm on every skin. */
export function blush(skin: number): number {
  const mix = (sh: number) => Math.round(((skin >> sh) & 255) * 0.55 + ((ROSE >> sh) & 255) * 0.45);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Eyes (iris tinted by eye colour, white highlight), brows in a darker hair colour, cheeks, mouth. */
export function faceParts(eyes: string, eyeColour: number, brows: string, browColour: number, mouth: string, skin: number): Part[] {
  return [
    ...mirrored((s) => [
      { kind: 'quad', bone: 'head', centre: [s * 0.25, 2.1, FRONT + 0.002], width: 0.13, height: 0.065, tile: 'blush', colour: blush(skin) },
      { kind: 'quad', bone: 'head', centre: [s * EYE_X, EYE_Y, FRONT + 0.002], width: EYE, height: EYE, tile: `eye-${eyes}`, colour: eyeColour, mirror: s < 0 },
      { kind: 'quad', bone: 'head', centre: [s * EYE_X, EYE_Y, FRONT + 0.004], width: EYE, height: EYE, tile: `hl-${eyes}`, colour: 0xffffff },
      { kind: 'quad', bone: 'head', centre: [s * EYE_X, 2.37, FRONT + 0.002], width: 0.2, height: 0.08125, tile: `brow-${brows}`, colour: shade(browColour, 0.8), mirror: s < 0 },
    ]),
    { kind: 'quad', bone: 'head', centre: [0, 2.05, FRONT + 0.002], width: 0.26, height: 0.13, tile: `mouth-${mouth}`, colour: 0xffffff },
  ];
}

/** Glasses slot: a frame quad in front of the eyes plus short temples that end before any hair panel. */
export function glassesParts(style: string, colour: number): Part[] {
  if (style === 'none') {
    return [];
  }
  return [
    { kind: 'quad', bone: 'head', centre: [0, EYE_Y, FRONT + 0.03], width: 0.84, height: 0.315, tile: `glasses-${style}`, colour },
    ...mirrored((s) => [box('head', s > 0 ? 0.4 : -0.42, s > 0 ? 0.42 : -0.4, 2.227, 2.253, 0.16, FRONT + 0.03, colour)]),
  ];
}
