/**
 * Refuel planner: chooses where and how much to refuel along a route so that the
 * total fuel cost (including detours and an optional per-stop penalty) is minimal.
 *
 * Dynamic programme over (stop, fuel-on-arrival) with fuel discretised to a grid.
 * Fuel left in the tank at the destination is credited at a reference price, so the
 * planner happily fills up at cheap stations instead of only buying the bare minimum.
 */

export interface PlanCandidate<T = unknown> {
  ref: T;
  alongKm: number;
  /** Extra kilometres driven to reach the station and return to the route. */
  detourKm: number;
  /** Price expected when we arrive there (EUR/l). */
  price: number;
}

export interface PlanInput<T = unknown> {
  routeKm: number;
  candidates: PlanCandidate<T>[];
  tankL: number;
  /** l/100km */
  consumption: number;
  startFuelL: number;
  /** Never drop below this amount (l). */
  reserveL: number;
  /** Desired minimum fuel at the destination (l), on top of the reserve. */
  endFuelL?: number;
  /** Value of fuel left over at the destination (EUR/l). */
  leftoverPrice: number;
  /** Penalty per stop in EUR (time is money). */
  stopPenalty?: number;
  /** Minimum amount per refuel (l). */
  minRefuelL?: number;
  /** Grid resolution (l). Defaults to tankL / 40. */
  stepL?: number;
}

export interface PlanStop<T = unknown> {
  candidate: PlanCandidate<T>;
  liters: number;
  cost: number;
  arrivalFuelL: number;
}

export interface PlanResult<T = unknown> {
  feasible: boolean;
  stops: PlanStop<T>[];
  fuelCost: number;
  liters: number;
  leftoverL: number;
  /** Net cost = fuelCost - leftover credit + stop penalties. */
  objective: number;
}

export function planRefuel<T>(input: PlanInput<T>): PlanResult<T> {
  const {
    routeKm,
    tankL,
    consumption,
    startFuelL,
    reserveL,
    leftoverPrice,
    stopPenalty = 0,
    endFuelL = 0,
  } = input;
  const minRefuel = input.minRefuelL ?? Math.min(5, tankL / 4);
  const step = input.stepL ?? Math.max(0.5, tankL / 40);
  const lpk = consumption / 100;
  const levels = Math.floor(tankL / step);
  const toLevel = (l: number) => Math.max(0, Math.min(levels, Math.floor(l / step + 1e-9)));

  const cands = [...input.candidates]
    .filter((c) => c.alongKm >= 0 && c.alongKm <= routeKm && Number.isFinite(c.price) && c.price > 0)
    .sort((a, b) => a.alongKm - b.alongKm);
  // Node 0 = start, 1..n = candidates, n+1 = destination.
  const nodesKm = [0, ...cands.map((c) => c.alongKm), routeKm];
  const n = cands.length;
  const N = n + 2;
  const INF = Number.POSITIVE_INFINITY;

  // best[i][f] = min cost to arrive at node i with fuel level f (before refuelling).
  const best: Float64Array[] = Array.from({ length: N }, () => new Float64Array(levels + 1).fill(INF));
  const prev: Int32Array[] = Array.from({ length: N }, () => new Int32Array(levels + 1).fill(-1));
  const prevBuy: Int32Array[] = Array.from({ length: N }, () => new Int32Array(levels + 1).fill(-1));

  const startLevel = toLevel(startFuelL);
  best[0][startLevel] = 0;

  for (let i = 0; i < N - 1; i++) {
    const isCand = i >= 1 && i <= n;
    const c = isCand ? cands[i - 1] : null;
    const detourL = c ? c.detourKm * lpk : 0;
    for (let f = 0; f <= levels; f++) {
      const base = best[i][f];
      if (base === INF) continue;
      // The start node never buys. A candidate node only makes sense as a stop if we buy there,
      // because skipping a station is already covered by driving past it from an earlier node.
      const options: number[] = c ? [] : [f];
      if (c) {
        // Reaching the station costs the detour fuel. The short detour may dip into the reserve
        // (that is what a reserve is for), but never below half of it.
        const fAtPump = f * step - detourL / 2;
        if (fAtPump >= reserveL / 2 - 1e-9) {
          const minG = toLevel(fAtPump + minRefuel);
          for (let g = Math.max(minG, f + 1); g <= levels; g++) options.push(g);
        }
      }
      for (const g of options) {
        const buying = g !== f;
        let cost = base;
        let fuelAfter = g * step;
        if (buying && c) {
          const fAtPump = f * step - detourL / 2;
          const liters = g * step - fAtPump;
          cost += liters * c.price + stopPenalty;
          fuelAfter = g * step - detourL / 2; // way back to the route
        }
        // Drive to every reachable next node j.
        for (let j = i + 1; j < N; j++) {
          const need = (nodesKm[j] - nodesKm[i]) * lpk;
          const arrive = fuelAfter - need;
          const minArrive = j === N - 1 ? reserveL + endFuelL : reserveL;
          if (arrive < minArrive - 1e-9) break;
          const al = toLevel(arrive);
          if (cost < best[j][al]) {
            best[j][al] = cost;
            prev[j][al] = i * (levels + 1) + f;
            prevBuy[j][al] = buying ? g : -1;
          }
        }
      }
    }
  }

  const dest = N - 1;
  let bestF = -1;
  let bestObj = INF;
  for (let f = 0; f <= levels; f++) {
    if (best[dest][f] === INF) continue;
    const obj = best[dest][f] - f * step * leftoverPrice;
    if (obj < bestObj - 1e-9) {
      bestObj = obj;
      bestF = f;
    }
  }
  if (bestF < 0) return { feasible: false, stops: [], fuelCost: 0, liters: 0, leftoverL: 0, objective: INF };

  // Reconstruct.
  const stops: PlanStop<T>[] = [];
  let node = dest;
  let f = bestF;
  while (node > 0) {
    const p = prev[node][f];
    const g = prevBuy[node][f];
    const pi = Math.floor(p / (levels + 1));
    const pf = p % (levels + 1);
    if (g >= 0 && pi >= 1 && pi <= n) {
      const c = cands[pi - 1];
      const detourL = c.detourKm * lpk;
      const fAtPump = pf * step - detourL / 2;
      const liters = g * step - fAtPump;
      stops.push({ candidate: c, liters, cost: liters * c.price, arrivalFuelL: fAtPump });
    }
    node = pi;
    f = pf;
  }
  stops.reverse();
  const fuelCost = stops.reduce((a, s) => a + s.cost, 0);
  const liters = stops.reduce((a, s) => a + s.liters, 0);
  return { feasible: true, stops, fuelCost, liters, leftoverL: bestF * step, objective: bestObj };
}
