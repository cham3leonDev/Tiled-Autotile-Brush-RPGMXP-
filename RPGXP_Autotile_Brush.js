/*
RPG Maker XP Autotile Brush for Tiled
====================================

This extension registers a custom tool that behaves like the RPG Maker XP
autotile brush:
- Left click: paint with the selected autotile (auto-updates variants)
- Right click: erase (auto-updates neighbors)

Tileset layout assumption
-------------------------
This tool assumes an "expanded autotile" tileset layout where each autotile group
contains 48 consecutive variant tiles.

It detects group/variant from the selected tile's local ID:
  group   = floor(tile.id / 48)   // 0-based
  variant = tile.id % 48

So your tileset should be arranged like:
  group 0: tiles 0..47
  group 1: tiles 48..95
  group 2: tiles 96..143
  ...
Regular (non-autotile) tiles can follow after your autotile groups.

Install
-------
Put this file in an extensions folder and restart Tiled:
- Windows: %APPDATA%\Tiled\extensions\rpgxp-autotile\rpgxp_autotile_brush.js
- Linux:   ~/.local/share/Tiled/extensions/rpgxp-autotile/rpgxp_autotile_brush.js
- macOS:   ~/Library/Preferences/Tiled/extensions/rpgxp-autotile/rpgxp_autotile_brush.js
*/

// Exact RMXP neighbor-mask -> variant mapping (256 entries), extracted from RMXP scripts.
const NEIGHBORS_TO_AUTOTILE_INDEX = [
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  42,
  32,
  42,
  32,
  35,
  19,
  35,
  18,
  42,
  32,
  42,
  32,
  34,
  17,
  34,
  16,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  42,
  32,
  42,
  32,
  35,
  19,
  35,
  18,
  42,
  32,
  42,
  32,
  34,
  17,
  34,
  16,
  45,
  39,
  45,
  39,
  33,
  31,
  33,
  29,
  45,
  39,
  45,
  39,
  33,
  31,
  33,
  29,
  37,
  27,
  37,
  27,
  23,
  15,
  23,
  13,
  37,
  27,
  37,
  27,
  22,
  11,
  22,
  9,
  45,
  39,
  45,
  39,
  33,
  31,
  33,
  29,
  45,
  39,
  45,
  39,
  33,
  31,
  33,
  29,
  36,
  26,
  36,
  26,
  21,
  7,
  21,
  5,
  36,
  26,
  36,
  26,
  20,
  3,
  20,
  1,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  42,
  32,
  42,
  32,
  35,
  19,
  35,
  18,
  42,
  32,
  42,
  32,
  34,
  17,
  34,
  16,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  46,
  44,
  46,
  44,
  43,
  41,
  43,
  40,
  42,
  32,
  42,
  32,
  35,
  19,
  35,
  18,
  42,
  32,
  42,
  32,
  34,
  17,
  34,
  16,
  45,
  38,
  45,
  38,
  33,
  30,
  33,
  28,
  45,
  38,
  45,
  38,
  33,
  30,
  33,
  28,
  37,
  25,
  37,
  25,
  23,
  14,
  23,
  12,
  37,
  25,
  37,
  25,
  22,
  10,
  22,
  8,
  45,
  38,
  45,
  38,
  33,
  30,
  33,
  28,
  45,
  38,
  45,
  38,
  33,
  30,
  33,
  28,
  36,
  24,
  36,
  24,
  21,
  6,
  21,
  4,
  36,
  24,
  36,
  24,
  20,
  2,
  20,
  0
];

const TILES_PER_AUTOTILE = 48;

function isTileLayer(layer) {
  return layer && layer.isTileLayer;
}

function getBrushTile() {
  // currentBrush is a TileMap (Tiled 1.11.1+)
  const brushMap = tiled.mapEditor.currentBrush;
  if (!brushMap || brushMap.layerCount < 1) return null;
  const layer = brushMap.layerAt(0);
  if (!layer || !layer.isTileLayer) return null;
  return layer.tileAt(0, 0);
}

function autotileGroupOf(tile) {
  // Default RMXP-style grouping: 48-tile blocks in the same tileset.
  if (!tile) return null;
  return Math.floor(tile.id / TILES_PER_AUTOTILE);
}

/**
 * If a tile in your "main mapping tileset" is marked as an autotile key,
 * it can point to a separate tileset (.tsx) that contains the 48 expanded variants.
 *
 * Properties written by the Tileset Editor action:
 *  - rpgxp.autotileKey (bool)
 *  - rpgxp.sourceTileset (string, absolute path to .tsx)
 *  - rpgxp.startId (int, default 0)
 */
function getAutotileSourceInfo(tile) {
  if (!tile) return null;
  const key = tile.property && tile.property("rpgxp.autotileKey");
  if (!key) return null;

  const tsxPath = tile.property("rpgxp.sourceTileset");
  const baseName = tile.property("rpgxp.sourceBasename");
  if (!tsxPath || typeof tsxPath !== "string") return null;

  let startId = tile.property("rpgxp.startId");
  if (startId === undefined || startId === null || startId === "") startId = 0;
  startId = Number(startId);
  if (!Number.isFinite(startId) || startId < 0) startId = 0;

  return { tsxPath, baseName, startId };
}

function ensureTilesetOpenedAndInMap(tsxPath, baseName, map) {
  // Require the source tileset to already be added to the map (Map -> Add External Tileset...).
  if (map && map.isTileMap && map.tilesets) {
    for (let i = 0; i < map.tilesets.length; i++) {
      const ts = map.tilesets[i];
      if (ts && ts.isTileset && ts.fileName) {
        if (ts.fileName === tsxPath) return ts;
        if (baseName && (ts.fileName.endsWith("/" + baseName) || ts.fileName.endsWith("\\" + baseName) || ts.fileName.endsWith(baseName))) return ts;
      }
    }
  }
  const msg = "RMXP Autotile Brush: Source tileset is not in this map yet.\\n\\n"
            + "Please add it once via: Map -> Add External Tileset...\\n\\n"
            + "Then try again.\\n\\n"
            + "Missing tileset:\\n" + tsxPath + (baseName ? ("\\n\\n(Basename: " + baseName + ")") : "");
  tiled.alert(msg);
  return null;
}

function tileAt(layer, x, y) {
  try {
    return layer.tileAt(x, y);
  } catch (e) {
    return null;
  }
}

function neighborMask(layer, x, y, groupKey) {
  // Bit order matches RMXP (TileDrawingHelper.tableNeighbors):
  // 0x01 N, 0x02 NE, 0x04 E, 0x08 SE, 0x10 S, 0x20 SW, 0x40 W, 0x80 NW
  // groupKey: { tileset, groupStartId }
  let mask = 0;
  const same = (tx, ty) => {
    const t = tileAt(layer, tx, ty);
    if (!t || !t.tileset) return false;
    if (t.tileset !== groupKey.tileset) return false;
    const start = groupKey.groupStartId;
    return t.id >= start && t.id < start + TILES_PER_AUTOTILE;
  };

  if (same(x, y - 1)) mask |= 0x01;
  if (same(x + 1, y - 1)) mask |= 0x02;
  if (same(x + 1, y)) mask |= 0x04;
  if (same(x + 1, y + 1)) mask |= 0x08;
  if (same(x, y + 1)) mask |= 0x10;
  if (same(x - 1, y + 1)) mask |= 0x20;
  if (same(x - 1, y)) mask |= 0x40;
  if (same(x - 1, y - 1)) mask |= 0x80;

  return mask;
}

function resolvedAutotileTile(tileset, groupStartId, mask) {
  const variant = NEIGHBORS_TO_AUTOTILE_INDEX[mask] ?? 0;
  const localId = groupStartId + variant;
  return tileset.tile(localId);
}

function updateAutotileCell(edit, layer, x, y) {
  const t = tileAt(layer, x, y);
  if (!t || !t.tileset) return;

  const tileset = t.tileset;

  // Determine which 48-tile autotile block this tile belongs to.
  const groupStartId = Math.floor(t.id / TILES_PER_AUTOTILE) * TILES_PER_AUTOTILE;

  // Guard: only update if the tileset actually has enough tiles for that block.
  const neededMax = groupStartId + TILES_PER_AUTOTILE;
  if (tileset.tileCount !== undefined && tileset.tileCount < neededMax) return;

  const groupKey = { tileset, groupStartId };
  const mask = neighborMask(layer, x, y, groupKey);
  const newTile = resolvedAutotileTile(tileset, groupStartId, mask);
  if (!newTile) return;

  // Preserve flags (flips/rotation) if available.
  const flags = layer.flagsAt ? layer.flagsAt(x, y) : 0;
  edit.setTile(x, y, newTile, flags);
}

function update3x3(edit, layer, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      updateAutotileCell(edit, layer, x + dx, y + dy);
    }
  }
}

// registerTool takes (shortName, toolDefinition)
const tool = tiled.registerTool("RMXPAutotileBrush", {
  name: "RMXP Autotile Brush",
  icon: "",
  usesSelectedTiles: true,
  targetLayerType: Layer.TileLayerType,

  mousePressed(button, x, y, modifiers) {
    const map = this.map;
    if (!map) return;

    const layer = map.currentLayer;
    if (!isTileLayer(layer)) return;

    const pos = this.tilePosition;
    if (!pos) return;

    const edit = layer.edit();

    if (button === Qt.RightButton) {
      // Erase + update neighbors
      edit.setTile(pos.x, pos.y, null);
      update3x3(edit, layer, pos.x, pos.y);
      edit.apply();
      return;
    }

    if (button !== Qt.LeftButton) return;

    const brushTile = getBrushTile();
    if (!brushTile) return;

    // If the selected tile is an "autotile key", it can point to a separate .tsx tileset
    // containing the 48 expanded variants.
    const src = getAutotileSourceInfo(brushTile);

    let tileset = brushTile.tileset;
    let groupStartId = null;

    if (src) {
      tileset = ensureTilesetOpenedAndInMap(src.tsxPath, src.baseName, map);
      groupStartId = src.startId;
      if (!tileset) {
        tiled.alert("RMXP Autotile Brush: Could not open the source tileset.\n\nMake sure the .tsx exists and is readable.\n\nPath:\n" + src.tsxPath);
        return;
      }
      if (tileset.tileCount !== undefined && tileset.tileCount < groupStartId + TILES_PER_AUTOTILE) {
        tiled.alert("RMXP Autotile Brush: Source tileset does not contain 48 tiles starting at startId=" + groupStartId + ".");
        return;
      }
    } else {
      // Default behavior: use the tileset the brush tile is from, with 48-tile blocks.
      tileset = brushTile.tileset;
      if (!tileset) return;
      groupStartId = Math.floor(brushTile.id / TILES_PER_AUTOTILE) * TILES_PER_AUTOTILE;
    }

    // Place a placeholder variant for this autotile block, then resolve using neighbor table.
    const placeholder = tileset.tile(groupStartId);
    if (!placeholder) {
      tiled.alert("RMXP Autotile Brush: Could not access tile id " + groupStartId + " in source tileset.\n\nTileset: " + (tileset.name || "(unnamed)") + "\nTileCount: " + tileset.tileCount + "\nFile: " + (tileset.fileName || "(embedded)"));
      return;
    }
    if (!placeholder) return;

    edit.setTile(pos.x, pos.y, placeholder);
    update3x3(edit, layer, pos.x, pos.y);
    edit.apply();
  },
});


// -----------------------------------------------------------------------------
// Global toggle: whether the brush updates neighboring tiles (RMXP-style).
// Some layers (like overlays/details) should not "auto-connect" to existing tiles.
// -----------------------------------------------------------------------------
let RMXP_UPDATE_NEIGHBORS = true;

const toggleNeighborsAction = tiled.registerAction("RMXPToggleNeighborUpdates", function() {
  RMXP_UPDATE_NEIGHBORS = !RMXP_UPDATE_NEIGHBORS;
  tiled.alert("RMXP Autotile Brush: Neighbor updates are now " + (RMXP_UPDATE_NEIGHBORS ? "ON" : "OFF") + ".");
});
toggleNeighborsAction.text = "RMXP: Toggle Neighbor Updates";

tiled.extendMenu("Map", [
  { action: "RMXPToggleNeighborUpdates", before: "MapProperties" }
]);

// -----------------------------------------------------------------------------
// Tileset Editor helper: assign a separate 48-tile autotile tileset (.tsx) to a
// single "key tile" in your main tileset.
// -----------------------------------------------------------------------------
const assignAction = tiled.registerAction("RMXPAssignAutotileSource", function(action) {
  const asset = tiled.activeAsset;
  if (!asset || !asset.isTileset) {
    tiled.alert("Open a Tileset and select a tile first.");
    return;
  }

  const tileset = asset;
  const selected = tileset.selectedTiles;
  if (!selected || selected.length !== 1) {
    tiled.alert("Please select exactly ONE tile in the Tileset Editor.\n\nThat tile will become your 'autotile key tile'.");
    return;
  }

  const keyTile = selected[0];

  // Ask for the source .tsx tileset that contains the 48 expanded variants.
  const tsxPath = tiled.promptOpenFile("", "Tiled Tileset (*.tsx);;All files (*)", "Select the autotile source tileset (.tsx)");
  if (!tsxPath) return;

  // Optional: ask for start ID inside that source tileset (default 0).
  const startText = tiled.prompt("Start tile ID inside the source tileset (usually 0)", "0", "RMXP Autotile");
  let startId = Number(startText);
  if (!Number.isFinite(startId) || startId < 0) startId = 0;

  // Write properties on the key tile (not on the whole tileset).
  // This uses the per-tile properties panel that Tiled already supports. citeturn0search1turn2search0
  tileset.macro("Assign RMXP Autotile Source", function() {
    keyTile.setProperty("rpgxp.autotileKey", true);
    keyTile.setProperty("rpgxp.sourceTileset", tsxPath);
    try {
      const base = tsxPath.split(/[/\\]/).pop();
      keyTile.setProperty("rpgxp.sourceBasename", base);
    } catch (e) {}

    keyTile.setProperty("rpgxp.startId", startId);
    // Visual marker in Tileset Editor
    try { keyTile.className = "RMXP_Autotile"; } catch (e) {}
  });

  tiled.log("Assigned RMXP autotile source to tile " + keyTile.id + ": " + tsxPath + " (startId=" + startId + ")");
});

assignAction.text = "RMXP: Assign Autotile Source…";

// Put the action in the Tileset menu (near Tileset Properties).
tiled.extendMenu("Tileset", [
  { action: "RMXPAssignAutotileSource", before: "TilesetProperties" },
  { separator: true }
]);

tool.statusInfo = "RMXP Autotile Brush: Left=paint, Right=erase (updates 3x3 neighbors)";
