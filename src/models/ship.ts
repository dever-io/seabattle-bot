export type ShipType = "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";

export type ShipOrientation = "horizontal" | "vertical";

export interface ShipPosition {
  row: number;
  col: number;
}

export const SHIP_SIZES: Record<ShipType, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

const FLEET_COMPOSITION: ShipType[] = [
  "carrier",
  "battleship",
  "cruiser",
  "submarine",
  "destroyer",
];

export function fleetTypes(): ShipType[] {
  return [...FLEET_COMPOSITION];
}

export interface Ship {
  id: string;
  owner: number;
  type: ShipType;
  size: number;
  positions: ShipPosition[];
  orientation: ShipOrientation;
  sunk: boolean;
  hits: ShipPosition[];
}

export function computePositions(
  row: number,
  col: number,
  orientation: ShipOrientation,
  size: number,
): ShipPosition[] {
  const positions: ShipPosition[] = [];
  for (let i = 0; i < size; i++) {
    positions.push(
      orientation === "horizontal"
        ? { row, col: col + i }
        : { row: row + i, col },
    );
  }
  return positions;
}