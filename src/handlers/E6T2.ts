import { Composer } from "grammy";
import { randomInt } from "node:crypto";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { getRedisClient } from "../storage/persistent.js";

const GRID_SIZE = 10;
const MAX_PLACEMENT_RESTARTS = 500;
const MAX_SHIP_ATTEMPTS = 100;

interface ShipDef {
  name: string;
  size: number;
}

const SHIPS: ShipDef[] = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

interface PlacedShip {
  type: string;
  row: number;
  col: number;
  orientation: "H" | "V";
}

interface PlacementState {
  selectedShip: string;
  orientation: "H" | "V";
  placedShips: PlacedShip[];
  remainingShips: string[];
  grid: number[][];
  ctrlMsgId: number;
  gridMsgId: number;
}

function newGrid(): number[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(0));
}

function canPlaceShip(
  grid: number[][],
  row: number,
  col: number,
  size: number,
  orientation: "H" | "V",
): boolean {
  if (orientation === "H") {
    if (col < 0 || col + size > GRID_SIZE) return false;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + size; c++) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && grid[r][c] === 1) {
          return false;
        }
      }
    }
  } else {
    if (row < 0 || row + size > GRID_SIZE) return false;
    for (let r = row - 1; r <= row + size; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && grid[r][c] === 1) {
          return false;
        }
      }
    }
  }
  return true;
}

function markShipOnGrid(
  grid: number[][],
  row: number,
  col: number,
  size: number,
  orientation: "H" | "V",
): number[][] {
  const newGrid = grid.map((r) => [...r]);
  if (orientation === "H") {
    for (let c = col; c < col + size; c++) newGrid[row][c] = 1;
  } else {
    for (let r = row; r < row + size; r++) newGrid[r][col] = 1;
  }
  return newGrid;
}

function tryPlaceOneShip(
  grid: number[][],
  ship: ShipDef,
): { grid: number[][]; placed: PlacedShip } | null {
  for (let attempt = 0; attempt < MAX_SHIP_ATTEMPTS; attempt++) {
    const orientation: "H" | "V" = Math.random() < 0.5 ? "H" : "V";
    const row = randomInt(GRID_SIZE);
    const col = randomInt(GRID_SIZE);

    if (canPlaceShip(grid, row, col, ship.size, orientation)) {
      return {
        grid: markShipOnGrid(grid, row, col, ship.size, orientation),
        placed: { type: ship.name, row, col, orientation },
      };
    }
  }
  return null;
}

function placeShips(
  baseGrid: number[][],
  shipsToPlace: ShipDef[],
): PlacedShip[] | null {
  for (let restart = 0; restart < MAX_PLACEMENT_RESTARTS; restart++) {
    let grid = baseGrid.map((r) => [...r]);
    const placed: PlacedShip[] = [];
    let success = true;

    for (const ship of shipsToPlace) {
      const result = tryPlaceOneShip(grid, ship);
      if (!result) {
        success = false;
        break;
      }
      grid = result.grid;
      placed.push(result.placed);
    }

    if (success) return placed;
  }
  return null;
}

function generateFullPlacement(): PlacedShip[] | null {
  const sorted = [...SHIPS].sort((a, b) => b.size - a.size);
  return placeShips(newGrid(), sorted);
}

function getPlacement(ctx: Ctx): PlacementState | undefined {
  return (ctx.session as Record<string, unknown>).shipPlacement as PlacementState | undefined;
}

function setPlacement(ctx: Ctx, state: PlacementState): void {
  (ctx.session as Record<string, unknown>).shipPlacement = state;
}

function buildGridKeyboard(grid: number[][]): ReturnType<typeof inlineKeyboard> {
  const rows = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row: ReturnType<typeof inlineButton>[] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const label = grid[r][c] === 1 ? "X" : ".";
      row.push(inlineButton(label, `ships:c:${r}:${c}`));
    }
    rows.push(row);
  }
  return inlineKeyboard(rows);
}

function buildControlsText(state: PlacementState): string {
  const placedCount = state.placedShips.length;
  const totalCount = SHIPS.length;
  const remainingList = state.remainingShips.length > 0
    ? state.remainingShips.join(", ")
    : "none";
  const selectedInfo = state.selectedShip
    ? `\nSelected: ${state.selectedShip} (${SHIPS.find((s) => s.name === state.selectedShip)?.size} cells)`
    : "";

  return [
    `Place your ships (${placedCount}/${totalCount} placed)`,
    `Remaining: ${remainingList}${selectedInfo}`,
    `Orientation: ${state.orientation === "H" ? "Horizontal" : "Vertical"}`,
    "\nTap a cell on the grid below to place the selected ship.",
  ].join("\n");
}

function buildControlsKeyboard(state: PlacementState): ReturnType<typeof inlineKeyboard> {
  const rows: ReturnType<typeof inlineButton>[][] = [];

  const shipRow = SHIPS.map((ship) => {
    const remaining = state.remainingShips.includes(ship.name);
    const selected = state.selectedShip === ship.name;
    const prefix = selected ? ">" : remaining ? "" : "";
    return inlineButton(
      `${prefix}${ship.name} (${ship.size})`,
      `ships:t:${ship.name}`,
    );
  });
  rows.push(shipRow);

  const rotLabel = state.orientation === "H" ? "Rotation: Horizontal" : "Rotation: Vertical";
  rows.push([inlineButton(rotLabel, "ships:rot")]);

  const actionRow: ReturnType<typeof inlineButton>[] = [];
  if (state.placedShips.length > 0) {
    actionRow.push(inlineButton("Confirm", "ships:done"));
  }
  actionRow.push(inlineButton("Reset", "ships:reset"));
  rows.push(actionRow);

  rows.push([
    inlineButton("Auto-place", "ships:autoplace"),
    inlineButton("Randomize", "ships:randomall"),
  ]);

  return inlineKeyboard(rows);
}

async function updateBothMessages(
  ctx: Ctx,
  state: PlacementState,
): Promise<void> {
  const gridKeyboard = buildGridKeyboard(state.grid);
  const ctrlText = buildControlsText(state);
  const ctrlKeyboard = buildControlsKeyboard(state);

  try {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      state.ctrlMsgId,
      ctrlText,
      { reply_markup: ctrlKeyboard },
    );
  } catch {
  }

  try {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      state.gridMsgId,
      "Your grid (tap a cell to place the selected ship):",
      { reply_markup: gridKeyboard },
    );
  } catch {
  }
}

function buildGridDisplayText(grid: number[][]): string {
  const rows = grid.map((r) => r.map((c) => (c === 1 ? "X" : ".")).join(" "));
  return rows.join("\n");
}

async function savePlacement(ctx: Ctx, ships: PlacedShip[]): Promise<boolean> {
  const redis = getRedisClient();
  const chatId = ctx.chat?.id;
  if (!redis || !chatId) return false;
  await redis.set(
    `shipgrid:${chatId}`,
    JSON.stringify(ships),
    "EX",
    86400,
  );
  return true;
}

async function applyAutoPlacement(
  ctx: Ctx,
  state: PlacementState,
  shipsToPlace: ShipDef[],
  clearFirst: boolean,
): Promise<{ saved: boolean }> {
  const baseGrid = clearFirst ? newGrid() : state.grid.map((r) => [...r]);
  const result = placeShips(baseGrid, shipsToPlace);

  if (!result) {
    await ctx.answerCallbackQuery({
      text: "Could not auto-place ships. Try resetting first.",
      show_alert: true,
    });
    return { saved: false };
  }

  if (clearFirst) {
    state.placedShips = [];
  }

  let currentGrid = baseGrid;
  let allPlaced = [...state.placedShips];
  for (const placed of result) {
    const ship = SHIPS.find((s) => s.name === placed.type)!;
    currentGrid = markShipOnGrid(currentGrid, placed.row, placed.col, ship.size, placed.orientation);
    allPlaced.push(placed);
  }

  state.grid = currentGrid;
  state.placedShips = allPlaced;
  state.remainingShips = SHIPS
    .map((s) => s.name)
    .filter((n) => !allPlaced.some((p) => p.type === n));

  if (state.remainingShips.length > 0) {
    state.selectedShip = state.remainingShips[0];
  }

  setPlacement(ctx, state);
  await updateBothMessages(ctx, state);

  let saved = false;
  if (state.remainingShips.length === 0) {
    saved = await savePlacement(ctx, allPlaced);
  }

  return { saved };
}

const composer = new Composer<Ctx>();

composer.callbackQuery("ships:autoplace", async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  if (state.remainingShips.length === 0) {
    await ctx.answerCallbackQuery({ text: "All ships already placed.", show_alert: true });
    return;
  }

  const remainingDefs = SHIPS
    .filter((s) => state.remainingShips.includes(s.name))
    .sort((a, b) => b.size - a.size);

  const result = await applyAutoPlacement(ctx, state, remainingDefs, false);
  if (state.remainingShips.length === 0 && !result.saved) {
    await ctx.answerCallbackQuery({
      text: "All ships placed but could not be saved: storage unavailable.",
      show_alert: true,
    });
  } else {
    await ctx.answerCallbackQuery();
  }
});

composer.callbackQuery("ships:randomall", async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  const allDefs = [...SHIPS].sort((a, b) => b.size - a.size);
  const result = await applyAutoPlacement(ctx, state, allDefs, true);
  if (state.remainingShips.length === 0 && !result.saved) {
    await ctx.answerCallbackQuery({
      text: "All ships placed but could not be saved: storage unavailable.",
      show_alert: true,
    });
  } else {
    await ctx.answerCallbackQuery();
  }
});

composer.command("auto_ships", async (ctx) => {
  const placement = generateFullPlacement();

  if (!placement) {
    await ctx.reply("Could not generate a valid ship placement. Please try again.");
    return;
  }

  const grid = newGrid();
  for (const ship of placement) {
    const def = SHIPS.find((s) => s.name === ship.type)!;
    if (ship.orientation === "H") {
      for (let c = ship.col; c < ship.col + def.size; c++) grid[ship.row][c] = 1;
    } else {
      for (let r = ship.row; r < ship.row + def.size; r++) grid[r][ship.col] = 1;
    }
  }

  const saved = await savePlacement(ctx, placement);
  const gridText = buildGridDisplayText(grid);

  if (saved) {
    await ctx.reply(`Auto-placed ships (saved):\n\n${gridText}\n\nUse /place_ships to manually adjust, or /auto_ships to regenerate.`);
  } else {
    await ctx.reply(`Auto-placed ships (NOT saved — storage unavailable):\n\n${gridText}\n\nUse /auto_ships to try again when storage is available.`);
  }
});

export default composer;