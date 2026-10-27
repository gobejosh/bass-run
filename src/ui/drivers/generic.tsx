import { getExercise } from "../../core/exercises";
import type { ExerciseDriver } from "./types";

/** Exercice sans tirage propre : consigne + métronome (RYT-01, EAR-01, et socle de l'étape 1). */
export const genericDriver: ExerciseDriver = {
  async prepare() {
    return { draws: {} };
  },
  Panel({ block }) {
    const ex = getExercise(block.exerciseId);
    return (
      <>
        <div className="mid">{ex.name}</div>
        <p className="consigne">{ex.consigne}</p>
      </>
    );
  },
};
