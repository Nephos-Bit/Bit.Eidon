export function mountLock(root, { onUnlocked } = {}) {
  root.replaceChildren();
  chrome.runtime.sendMessage({ type: "lock-status" }).then((status) => {
    render(status || { hasPassphrase: false });
  });

  function render(status) {
    const box = document.createElement("form");
    box.className = "lock";
    const title = document.createElement("h2");
    title.textContent = status.hasPassphrase ? "Eidon entsperren" : "Sperre festlegen";
    const note = document.createElement("p");
    note.textContent = status.hasPassphrase
      ? "Website- und Postfach-Passwörter liegen verschlüsselt. Ohne die Sperre sind sie nicht lesbar."
      : "Die Sperre verschlüsselt Website- und Postfach-Passwörter auf diesem Gerät. Mindestens 8 Zeichen.";
    const input = document.createElement("input");
    input.type = "password";
    input.required = true;
    input.minLength = 8;
    input.autocomplete = status.hasPassphrase ? "current-password" : "new-password";
    const error = document.createElement("p");
    error.className = "lock-error";
    error.hidden = true;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "tm-action tm-primary";
    submit.textContent = status.hasPassphrase ? "Entsperren" : "Sperre setzen";
    box.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      const type = status.hasPassphrase ? "unlock" : "set-lock";
      const response = await chrome.runtime.sendMessage({ type, passphrase: input.value }).catch(() => null);
      submit.disabled = false;
      if (!response?.ok) {
        error.hidden = false;
        error.textContent = response?.error || "Die Sperre stimmt nicht.";
        return;
      }
      onUnlocked?.();
    });
    box.append(title, note, input, error, submit);
    if (status.hasPassphrase) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "tm-action";
      reset.textContent = "Sperre zurücksetzen";
      reset.addEventListener("click", async () => {
        const sure = window.confirm(
          "Die lokale Kopie wird gelöscht. Postfächer beim Anbieter bleiben bestehen und können danach nicht mehr gelöscht werden.",
        );
        if (!sure) return;
        await chrome.runtime.sendMessage({ type: "reset-lock" });
        const next = await chrome.runtime.sendMessage({ type: "lock-status" });
        render(next || { hasPassphrase: false });
      });
      box.append(reset);
    }
    root.replaceChildren(box);
    input.focus();
  }
}
