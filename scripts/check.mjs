import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { generateLocalPart, generatePassword } from "../src/lib/password.js";

const sandbox = {};
runInContext(readFileSync(new URL("../src/lib/form-kind.js", import.meta.url), "utf8"), createContext(sandbox));
const { classifyForm, classifyNameField, classifyBirthField, isSignupLabel, isTermsLabel, isMarketingLabel } = sandbox.TrashmailForm;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(classifyForm({ text: "Konto erstellen", passwordCount: 2 }) === "signup", "Registrierung mit zwei Passwörtern");
assert(classifyForm({ text: "Sign in", passwordCount: 1, hasNewPassword: true }) === "signup", "new-password bleibt Registrierung");
assert(
  classifyForm({ text: "Anmelden", passwordCount: 1, hasCurrentPassword: true }) === "login",
  "Reines Login",
);
assert(classifyForm({ text: "Newsletter", passwordCount: 0 }) === null, "E-Mail ohne Passwort ignorieren");
assert(isSignupLabel("Konto erstellen"), "Submit-Text");
assert(!isSignupLabel("Anmelden"), "Login-Text ist kein Signup");
assert(classifyNameField({ hint: "Vorname", autocomplete: "given-name" }) === "given", "Vorname");
assert(classifyNameField({ hint: "Nachname", autocomplete: "family-name" }) === "family", "Nachname");
assert(classifyNameField({ hint: "Vollständiger Name", autocomplete: "name" }) === "full", "Voller Name");
assert(classifyNameField({ hint: "Benutzername", autocomplete: "username" }) === null, "Benutzername bleibt leer");
assert(classifyNameField({ hint: "Anrede", tag: "select" }) === "honorific", "Anrede");
assert(classifyBirthField({ placeholder: "DD" }) === "day", "Geburtstag");
assert(classifyBirthField({ placeholder: "MM" }) === "month", "Geburtsmonat");
assert(classifyBirthField({ placeholder: "YYYY" }) === "year", "Geburtsjahr");
assert(isTermsLabel("Ich bestätige die Geschäftsbedingungen") === true, "AGB");
assert(isMarketingLabel("Newsletter abonnieren") === true, "Newsletter");
assert(
  classifyForm &&
    TrashmailFormLooks(sandbox),
  "Passwort-Setup und Mailcode",
);

function TrashmailFormLooks(sandbox) {
  const api = sandbox.TrashmailForm;
  return (
    api.looksLikePasswordSetup({ hint: "Passwort eingeben", context: "1 Großbuchstabe 1 Sonderzeichen" }) === true &&
    api.looksLikePasswordSetup({ hint: "Passwort", autocomplete: "current-password" }) === false &&
    api.looksLikeCodeField({ hint: "Verifizierungscode", autocomplete: "one-time-code" }) === true &&
    api.extractMailCode("Dein Code lautet 482913") === "482913"
  );
}
assert(
  classifyForm({ text: "", passwordCount: 0, continueText: "Mit E-Mail fortfahren" }) === "signup",
  "E-Mail-Schritt ohne Passwort",
);
assert(
  classifyForm({
    text: "",
    passwordCount: 0,
    continueText: "Mit Google fortfahren\nMit E-Mail fortfahren",
  }) === "signup",
  "E-Mail-Schritt neben Social-Login",
);

for (let index = 0; index < 30; index += 1) {
  const password = generatePassword();
  assert(password.length === 16, password);
  assert(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[!@#$%&*]/.test(password), password);
  const local = generateLocalPart();
  assert(/^[a-z][a-z0-9]{11}$/.test(local), local);
}

console.log("checks ok");
