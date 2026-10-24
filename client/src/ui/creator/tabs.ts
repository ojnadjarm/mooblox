import type { Field } from '../../player/character/catalog';

export type TabId = 'hair' | 'face' | 'skin' | 'clothes';

/** The creator's tabs, each a list of fields shown as option rows. */
export const TABS: readonly { readonly id: TabId; readonly fields: readonly Field[] }[] = [
  { id: 'hair', fields: ['hair', 'hairc'] },
  { id: 'face', fields: ['eyes', 'eyec', 'brows', 'mouth', 'glasses', 'glassesc'] },
  { id: 'skin', fields: ['skin'] },
  { id: 'clothes', fields: ['top', 'topc', 'bottom', 'bottomc', 'shoes', 'shoesc'] },
];
