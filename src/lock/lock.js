import { mountLock } from "./lock-form.js";

mountLock(document.querySelector("#app"), {
  onUnlocked() {
    window.close();
  },
});
