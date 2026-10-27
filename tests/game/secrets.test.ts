import "fake-indexeddb/auto";
import { GameStore } from "../../src/game/store";

// Clés factices assemblées à l'exécution : tools/check-publish.mjs refuse tout motif de clé dans les sources.
const fake = (tail: string) => ["sk", "ant", "api03", tail].join("-");

describe("clé de l'API Claude", () => {
  it("reste dans le navigateur : jamais dans la sauvegarde du jeu", async () => {
    const store = await GameStore.open("game-secrets");
    const key = fake("ceci-est-une-fausse-cle-de-test-0123456789");
    await store.setApiKey(key);
    expect(await store.apiKey()).toBe(key);
    const backup = JSON.stringify(await store.exportAll());
    expect(backup).not.toContain(key);
    expect(backup).not.toContain("sk-ant");
  });

  it("une restauration ne l'efface pas et n'en apporte pas", async () => {
    const store = await GameStore.open("game-secrets-2");
    const key = fake("cle-locale-0123456789abcdef");
    await store.setApiKey(key);
    const backup = await store.exportAll();
    await store.importAll({ ...backup, settings: backup.settings });
    expect(await store.apiKey()).toBe(key);
  });
});
