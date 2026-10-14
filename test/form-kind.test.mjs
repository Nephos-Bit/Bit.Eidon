import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

const sandbox = {};
runInContext(readFileSync(new URL("../src/lib/form-kind.js", import.meta.url), "utf8"), createContext(sandbox));
const { classifyForm } = sandbox.TrashmailForm;

test("Registrierung mit zwei Passwörtern", () => {
  assert.equal(classifyForm({ text: "Konto erstellen", passwordCount: 2 }), "signup");
});

test("Login mit einem aktuellen Passwort", () => {
  assert.equal(classifyForm({ text: "Anmelden", passwordCount: 1, hasCurrentPassword: true }), "login");
});

test("Signup-Button bleibt Registrierung", () => {
  assert.equal(classifyForm({ text: "Sign in", passwordCount: 1, continueText: "Create an account" }), "signup");
});

test("Login-Schritt bleibt Login", () => {
  assert.equal(classifyForm({ text: "Anmelden", passwordCount: 1, continueText: "Anmelden" }), "login");
});
