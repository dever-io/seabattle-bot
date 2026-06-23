import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { boardStorage } from "../models/board.js";
import { SHIP_SIZES, type ShipOrientation, type ShipType } from "../models/ship.js";

const VALID_TYPES = new Set<string>(Object.keys(SHIP_SIZES));
const VALID_ORIENTATIONS = new Set<string>(["horizontal", "vertical"]);

const composer = new Composer<Ctx>();

composer.command("placeship", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  if (args.length < 5) {
    await ctx.reply("Usage: /placeship <type> <row> <col> <orientation>\nTypes: carrier, battleship, cruiser, submarine, destroyer\nOrientation: horizontal, vertical");
    return;
  }

  const shipType = args[1].toLowerCase();
  const row = parseInt(args[2], 10);
  const col = parseInt(args[3], 10);
  const orientation = args[4].toLowerCase();

  if (!VALID_TYPES.has(shipType)) {
    await ctx.reply(`Unknown ship type: ${shipType}. Valid types: carrier, battleship, cruiser, submarine, destroyer.`);
    return;
  }

  if (isNaN(row) || row < 0) {
    await ctx.reply("Row must be a non-negative integer.");
    return;
  }

  if (isNaN(col) || col < 0) {
    await ctx.reply("Col must be a non-negative integer.");
    return;
  }

  if (!VALID_ORIENTATIONS.has(orientation)) {
    await ctx.reply("Orientation must be horizontal or vertical.");
    return;
  }

  const result = await boardStorage.placeShip(
    ctx.from.id,
    shipType as ShipType,
    row,
    col,
    orientation as ShipOrientation,
  );

  if (!result.ok) {
    if (result.error === "bounds") {
      await ctx.reply("Ship placement out of bounds.");
    } else if (result.error === "overlap") {
      await ctx.reply("Ship overlaps with an existing ship.");
    } else {
      await ctx.reply("Ship type already placed.");
    }
    return;
  }

  const ship = result.ship;
  const posStr = ship.positions.map((p) => `(${p.row},${p.col})`).join(" ");
  await ctx.reply(
    `Ship placed: ${ship.type} (${ship.size} cells) ${ship.orientation}\nPositions: ${posStr}`,
  );
});

composer.command("myboard", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const board = await boardStorage.getBoard(ctx.from.id);
  const shipLines = board.ships.map((s) => {
    const status = s.sunk ? "[sunk]" : "";
    const posStr = s.positions.map((p) => `(${p.row},${p.col})`).join(" ");
    return `${s.type} ${status}: ${posStr}`;
  });
  const hitKeys = board.hits.map((h) => `(${h.row},${h.col})`).join(" ");
  const missKeys = board.misses.map((m) => `(${m.row},${m.col})`).join(" ");
  const lines: string[] = [];
  lines.push(`Board for player ${board.owner}`);
  if (shipLines.length === 0) {
    lines.push("No ships placed.");
  } else {
    lines.push(...shipLines);
  }
  lines.push(`Hits: ${hitKeys || "(none)"}`);
  lines.push(`Misses: ${missKeys || "(none)"}`);
  await ctx.reply(lines.join("\n"));
});

export default composer;