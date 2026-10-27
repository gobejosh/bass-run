/** Choix du thème (Réglages). Jamais proposé pendant un bloc : Réglages n'est pas accessible en mode scène. */
import { useState } from "react";
import { applyTheme, currentTheme, THEMES, type ThemeId } from "../theme";

export function ThemePicker() {
  const [value, setValue] = useState<ThemeId>(() => currentTheme());
  return (
    <fieldset className="theme-picker">
      <legend><h2>Thème de l'application</h2></legend>
      <div className="theme-list" role="radiogroup" aria-label="Thème">
        {THEMES.map((t) => (
          <label key={t.id} className="theme-opt">
            <input type="radio" name="theme" value={t.id} checked={value === t.id} onChange={() => setValue(applyTheme(t.id))} />
            <span className="theme-name">{t.label}</span>
            <span className="swatches" aria-hidden="true">
              {t.swatches.map((c) => <i key={c} style={{ background: c }} />)}
            </span>
          </label>
        ))}
      </div>
      <p className="dim small">Le thème est propre à cet appareil (il n'entre pas dans les sauvegardes). Tous les thèmes fonctionnent hors ligne.</p>
    </fieldset>
  );
}
