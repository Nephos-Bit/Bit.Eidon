import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { sameHost } from "../src/lib/host.js";
import { extractMailCode } from "../src/lib/mail-code.js";
import { generateLocalPart, generatePassword, generatePerson } from "../src/lib/password.js";
import { PBKDF2_ITERATIONS, decryptText, deriveAesKey, encryptText } from "../src/lib/secrets.js";

const sandbox = {};
runInContext(readFileSync(new URL("../src/lib/form-kind.js", import.meta.url), "utf8"), createContext(sandbox));
const { classifyForm, classifyNameField, classifyBirthField, isSignupLabel, isTermsLabel, isMarketingLabel, isNewsletterText } =
  sandbox.TrashmailForm;

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
assert(classifyBirthField({ placeholder: "TT.MM.JJJJ" }) === "date-de", "Geburtsdatum TT.MM.JJJJ");
assert(classifyBirthField({ hint: "Geburtsdatum", autocomplete: "bday" }) === "date-de", "Geburtsdatum als Text");
assert(classifyBirthField({ hint: "birthday Geburtsdatum", autocomplete: "bday" }) === "date-de", "birthday bleibt das volle Datum");
assert(classifyBirthField({ placeholder: "TT", hint: "Tag" }) === "day", "Einzelnes Tagesfeld");
assert(classifyBirthField({ type: "date", autocomplete: "bday", hint: "Geburtsdatum" }) === "date", "Native Datumsfelder bleiben ISO");
assert(classifyBirthField({ placeholder: "YYYY-MM-DD", hint: "Date of birth" }) === "date", "ISO-Textfeld");
assert(classifyBirthField({ placeholder: "MM/DD/YYYY" }) === "date-us", "US-Datum");
assert(isTermsLabel("Ich bestätige die Geschäftsbedingungen") === true, "AGB");
assert(isMarketingLabel("Newsletter abonnieren") === true, "Newsletter");
assert(isNewsletterText("Newsletter abonnieren") === true, "Newsletter-Feld");
assert(isNewsletterText("Vorname Passwort Newsletter") === false, "Registrierung bleibt kein Newsletter");
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
    api.looksLikeCodeField({ hint: "Verifizierungscode", autocomplete: "one-time-code" }) === true
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
assert(classifyForm({ text: "Create an account", passwordCount: 1 }) === "signup", "create an account");
assert(classifyForm({ text: "Konto anlegen", passwordCount: 1 }) === "signup", "Konto anlegen");
assert(
  classifyForm({
    text: "Sign in. No account? Sign up",
    passwordCount: 1,
    continueText: "Log in",
  }) === "login",
  "Signup-Link im Text bleibt Login",
);
assert(
  classifyForm({ text: "Sign in", passwordCount: 1, continueText: "Create an account" }) === "signup",
  "Signup-Button bleibt Registrierung",
);
assert(classifyForm({ text: "Passwort", passwordCount: 1, continueText: "Weiter" }) === "signup", "Passwort-Schritt bleibt Registrierung");
assert(classifyForm({ text: "Anmelden", passwordCount: 1, continueText: "Anmelden" }) === "login", "Login-Schritt bleibt Login");
assert(sandbox.TrashmailForm.looksLikeCodeField({ hint: "Postal code" }) === false, "Postleitzahl ist kein Mailcode");
assert(sandbox.TrashmailForm.looksLikeCodeField({ hint: "Promo code" }) === false, "Promo-Code ist kein Mailcode");

for (let index = 0; index < 30; index += 1) {
  const password = generatePassword();
  assert(password.length === 16, password);
  assert(/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[!@#$%&*]/.test(password), password);
  const local = generateLocalPart();
  assert(/^[a-z][a-z0-9]{11}$/.test(local), local);
}

assert(extractMailCode("Dein Code lautet 482913") === "482913", "Mailcode");
assert(extractMailCode("Deine Sendung 482913 ist unterwegs") === "", "Zahl ohne Code-Wort");
assert(sameHost("https://www.example.com/pfad", "https://example.com"), "www zählt als derselbe Host");
assert(!sameHost("https://shop.example.com", "https://example.com"), "Subdomain zählt nicht");
assert(!sameHost("https://example.com.evil.test", "https://example.com"), "fremder Host zählt nicht");
assert(!sameHost("keine-url", "https://example.com"), "kaputte URL zählt nicht");

const births = new Set();
const today = new Date();
for (let index = 0; index < 20; index += 1) {
  const person = generatePerson();
  const birth = new Date(Number(person.birthYear), Number(person.birthMonth) - 1, Number(person.birthDay));
  const adultOn = new Date(birth);
  adultOn.setFullYear(adultOn.getFullYear() + 18);
  assert(adultOn <= today, `${person.birthYear}-${person.birthMonth}-${person.birthDay}`);
  births.add(`${person.birthYear}-${person.birthMonth}-${person.birthDay}`);
}
assert(births.size > 1, "Geburtsdatum variiert");

assert(PBKDF2_ITERATIONS === 600000, "PBKDF2-Runden");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await deriveAesKey("eidon-test", salt, 1000);
const sealed = await encryptText(key, "site-secret");
const again = await encryptText(key, "site-secret");
assert(sealed.iv !== again.iv, "jedes Feld hat ein eigenes IV");
assert((await decryptText(key, sealed)) === "site-secret", "AES-GCM-Runde");

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8").trim();
const cards = readFileSync(new URL("../src/styles/cards.css", import.meta.url), "utf8").trim();
const toast = readFileSync(new URL("../src/content/toast-style.js", import.meta.url), "utf8");
assert(toast.includes(tokens), "tokens.css in toast-style.js");
assert(toast.includes(cards), "cards.css in toast-style.js");

console.log("checks ok");
