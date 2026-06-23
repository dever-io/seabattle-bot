import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { getRedisClient } from "../storage/persistent.js";

const GRID_SIZE = 10;

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

function getPlacement(ctx: Ctx): PlacementState | undefined {
  return (ctx.session as Record<string, unknown>).shipPlacement as PlacementState | undefined;
}

function setPlacement(ctx: Ctx, state: PlacementState): void {
  (ctx.session as Record<string, unknown>).shipPlacement = state;
}

function clearPlacement(ctx: Ctx): void {
  delete (ctx.session as Record<string, unknown>).shipPlacement;
}

function canPlaceShip(
  grid: number[][],
  row: number,
  col: number,
  size: number,
  orientation: "H" | "V",
): boolean {
  if (orientation === "H") {
    if (col + size > GRID_SIZE) return false;
    for (let c = col; c < col + size; c++) {
      if (grid[row][c] !== 0) return false;
    }
  } else {
    if (row + size > GRID_SIZE) return false;
    for (let r = row; r < row + size; r++) {
      if (grid[r][col] !== 0) return false;
    }
  }
  return true;
}

function placeShipOnGrid(
  grid: number[][],
  row: number,
  col: number,
  size: number,
  orientation: "H" | "V",
): number[][] {
  const newGrid = grid.map((r) => [...r]);
  if (orientation === "H") {
    for (let c = col; c < col + size; c++) {
      newGrid[row][c] = 1;
    }
  } else {
    for (let r = row; r < row + size; r++) {
      newGrid[r][col] = 1;
    }
  }
  return newGrid;
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

const composer = new Composer<Ctx>();

composer.command("place_ships", async (ctx) => {
  const remainingShips = SHIPS.map((s) => s.name);
  const state: PlacementState = {
    selectedShip: remainingShips[0],
    orientation: "H",
    placedShips: [],
    remainingShips,
    grid: newGrid(),
    ctrlMsgId: 0,
    gridMsgId: 0,
  };

  const ctrlMsg = await ctx.reply(buildControlsText(state), {
    reply_markup: buildControlsKeyboard(state),
  });
  const gridMsg = await ctx.reply(
    "Your grid (tap a cell to place the selected ship):",
    { reply_markup: buildGridKeyboard(state.grid) },
  );

  state.ctrlMsgId = ctrlMsg.message_id;
  state.gridMsgId = gridMsg.message_id;
  setPlacement(ctx, state);
});

composer.callbackQuery(/^ships:t:(.+)$/, async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  const shipName = ctx.match[1];
  if (!state.remainingShips.includes(shipName)) {
    await ctx.answerCallbackQuery({ text: `${shipName} already placed.`, show_alert: true });
    return;
  }

  state.selectedShip = shipName;
  setPlacement(ctx, state);
  await updateBothMessages(ctx, state);
  await ctx.answerCallbackQuery();
});

composer.callbackQuery("ships:rot", async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  state.orientation = state.orientation === "H" ? "V" : "H";
  setPlacement(ctx, state);
  await updateBothMessages(ctx, state);
  await ctx.answerCallbackQuery();
});

composer.callbackQuery(/^ships:c:(\d+):(\d+)$/, async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  const row = parseInt(ctx.match[1], 10);
  const col = parseInt(ctx.match[2], 10);

  if (!state.remainingShips.includes(state.selectedShip)) {
    await ctx.answerCallbackQuery({ text: `${state.selectedShip} already placed.`, show_alert: true });
    return;
  }

  const shipDef = SHIPS.find((s) => s.name === state.selectedShip);
  if (!shipDef) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (!canPlaceShip(state.grid, row, col, shipDef.size, state.orientation)) {
    await ctx.answerCallbackQuery({ text: "Cannot place ship there.", show_alert: true });
    return;
  }

  state.grid = placeShipOnGrid(state.grid, row, col, shipDef.size, state.orientation);
  state.placedShips.push({
    type: state.selectedShip,
    row,
    col,
    orientation: state.orientation,
  });
  state.remainingShips = state.remainingShips.filter((s) => s !== state.selectedShip);

  if (state.remainingShips.length > 0) {
    state.selectedShip = state.remainingShips[0];
  }

  setPlacement(ctx, state);
  await updateBothMessages(ctx, state);
  await ctx.answerCallbackQuery();
});

composer.callbackQuery("ships:done", async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  if (state.remainingShips.length > 0) {
    const remaining = state.remainingShips.join(", ");
    await ctx.answerCallbackQuery({
      text: `All ships must be placed first. Remaining: ${remaining}`,
      show_alert: true,
    });
    return;
  }

  const redis = getRedisClient();
  const chatId = ctx.chat?.id;
  if (redis && chatId) {
    await redis.set(
      `shipgrid:${chatId}`,
      JSON.stringify(state.placedShips),
      "EX",
      86400,
    );
  }

  await ctx.api.editMessageText(
    ctx.chat!.id,
    state.ctrlMsgId,
    "All ships placed! Ready for battle.",
  );
  try {
    await ctx.api.editMessageReplyMarkup(ctx.chat!.id, state.gridMsgId);
  } catch {
  }

  clearPlacement(ctx);
  await ctx.answerCallbackQuery();
});

composer.callbackQuery("ships:reset", async (ctx) => {
  const state = getPlacement(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Start with /place_ships first.", show_alert: true });
    return;
  }

  const remainingShips = SHIPS.map((s) => s.name);
  state.selectedShip = remainingShips[0];
  state.orientation = "H";
  state.placedShips = [];
  state.remainingShips = remainingShips;
  state.grid = newGrid();
  setPlacement(ctx, state);
  await updateBothMessages(ctx, state);
  await ctx.answerCallbackQuery();
});

export default composer;