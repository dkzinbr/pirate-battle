import shipsSheetXml from '../../../assets/spritesheet/ships_miscellaneous_sheet.xml?url';
import shipsSheetPng from '../../../assets/spritesheet/ships_miscellaneous_sheet.png?url';
import shipsSheetRetinaXml from '../../../assets/spritesheet/ships_miscellaneous_sheet_retina.xml?url';
import shipsSheetRetinaPng from '../../../assets/spritesheet/ships_miscellaneous_sheet_retina.png?url';
import uiSheetJson from '../../../assets/spritesheet/ui_sheet.json?url';
import uiSheetPng from '../../../assets/spritesheet/ui_sheet.png?url';
import uiSheetRetinaJson from '../../../assets/spritesheet/ui_sheet_retina.json?url';
import uiSheetRetinaPng from '../../../assets/spritesheet/ui_sheet_retina.png?url';
import tilesSheetPng from '../../../assets/tilesheet/tiles_sheet.png?url';
import tilesSheetRetinaPng from '../../../assets/tilesheet/tiles_sheet_retina.png?url';

export interface AtlasManifest {
  resolution: 1 | 2;
  shipsImage: string;
  shipsAtlas: string;
  tilesImage: string;
  uiImage: string;
  uiAtlas: string;
}

const STANDARD: AtlasManifest = {
  resolution: 1,
  shipsImage: shipsSheetPng,
  shipsAtlas: shipsSheetXml,
  tilesImage: tilesSheetPng,
  uiImage: uiSheetPng,
  uiAtlas: uiSheetJson,
};

const RETINA: AtlasManifest = {
  resolution: 2,
  shipsImage: shipsSheetRetinaPng,
  shipsAtlas: shipsSheetRetinaXml,
  tilesImage: tilesSheetRetinaPng,
  uiImage: uiSheetRetinaPng,
  uiAtlas: uiSheetRetinaJson,
};

/** High density screens get the 2x atlases; logical sizes stay identical. */
export function pickManifest(devicePixelRatio: number): AtlasManifest {
  return devicePixelRatio >= 1.5 ? RETINA : STANDARD;
}
