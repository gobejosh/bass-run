import type { ExerciseId } from "../../core/types";
import { chordDriver } from "./chord";
import { dec01Driver, dec02Driver } from "./dec";
import { fragmentDriver, fullGridDriver } from "./grid";
import { repDriver } from "./rep";
import { genericDriver } from "./generic";
import { man01Driver } from "./man01";
import { man02Driver } from "./man02";
import { man03Driver } from "./man03";
import { mod01Driver } from "./mod01";
import type { ExerciseDriver } from "./types";

const DRIVERS: Partial<Record<ExerciseId, ExerciseDriver>> = {
  "MAN-01": man01Driver,
  "MAN-02": man02Driver,
  "MAN-03": man03Driver,
  "MOD-01": mod01Driver,
  "WLK-01": chordDriver,
  "IMP-01": chordDriver,
  "WLK-02": fragmentDriver,
  "IMP-02": fragmentDriver,
  "WLK-03": fullGridDriver,
  "IMP-03": fullGridDriver,
  "REP-01": repDriver,
  "DEC-01": dec01Driver,
  "DEC-02": dec02Driver,
};

export function driverFor(id: ExerciseId): ExerciseDriver {
  return DRIVERS[id] ?? genericDriver;
}
