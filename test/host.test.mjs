import assert from "node:assert/strict";
import test from "node:test";
import { iconPages, pageOrigin, sameHost, sameSite } from "../src/lib/host.js";

test("www zählt als derselbe Host", () => {
  assert.equal(sameHost("https://www.example.com/pfad", "https://example.com"), true);
});

test("Subdomain und fremder Host zählen nicht", () => {
  assert.equal(sameHost("https://shop.example.com", "https://example.com"), false);
  assert.equal(sameHost("https://example.com.evil.test", "https://example.com"), false);
  assert.equal(sameHost("keine-url", "https://example.com"), false);
});

test("dieselbe Website ignoriert www und den Pfad", () => {
  assert.equal(pageOrigin("https://www.example.com/pfad"), "https://example.com");
  assert.equal(sameSite("https://www.example.com/pfad", "https://example.com"), true);
});

test("Schema und Port trennen Websites", () => {
  assert.equal(sameSite("http://example.com", "https://example.com"), false);
  assert.equal(sameSite("https://example.com:8443/login", "https://example.com"), false);
  assert.equal(sameSite("https://example.com:443/login", "https://example.com"), true);
});

test("Subdomain ist keine gleiche Website", () => {
  assert.equal(sameSite("https://shop.example.com", "https://example.com"), false);
});

test("Icon-Suche probiert www vor der gespeicherten Origin", () => {
  assert.deepEqual(iconPages("https://thalia.de"), ["https://www.thalia.de/", "https://thalia.de/"]);
});

test("besuchte Seite steht vor den Origin-Varianten", () => {
  assert.deepEqual(iconPages("https://snipes.com", "https://www.snipes.com/shop/account?x=1#teil"), [
    "https://www.snipes.com/shop/account",
    "https://www.snipes.com/",
    "https://snipes.com/",
  ]);
});
