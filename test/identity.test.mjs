import assert from "node:assert/strict";
import test from "node:test";
import { identityKind, usedAt } from "../src/lib/identity.js";

test("fehlendes kind gilt als temporär", () => {
  assert.equal(identityKind(undefined), "temporary");
  assert.equal(identityKind({}), "temporary");
  assert.equal(identityKind({ kind: "" }), "temporary");
  assert.equal(identityKind({ kind: "temporary" }), "temporary");
});

test("letzte Nutzung fällt auf das Erstelldatum zurück", () => {
  assert.equal(usedAt({ createdAt: 5 }), 5);
  assert.equal(usedAt({ createdAt: 5, lastUsedAt: 9 }), 9);
  assert.equal(usedAt(undefined), 0);
});
