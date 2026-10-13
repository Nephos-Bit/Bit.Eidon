const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";
const LOCAL = "abcdefghijklmnopqrstuvwxyz0123456789";

function pick(alphabet, value) {
  return alphabet[value % alphabet.length];
}

function shuffle(chars) {
  const random = new Uint32Array(chars.length);
  crypto.getRandomValues(random);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = random[index] % (index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars;
}

export function generatePassword(length = 16) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = [
    pick(LOWER, random[0]),
    pick(UPPER, random[1]),
    pick(DIGITS, random[2]),
    pick(SYMBOLS, random[3]),
  ];
  for (let index = 4; index < length; index += 1) {
    chars.push(pick(all, random[index]));
  }
  return shuffle(chars).join("");
}

export function generateLocalPart(length = 12) {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = [pick(LOWER, random[0])];
  for (let index = 1; index < length; index += 1) {
    chars.push(pick(LOCAL, random[index]));
  }
  return chars.join("");
}

const GIVEN_NAMES = ["Mara", "Jonas", "Lina", "Finn", "Nora", "Luis", "Emma", "Paul", "Ida", "Theo"];
const FAMILY_NAMES = ["Berger", "Keller", "Hoffmann", "Schwarz", "Wagner", "Krüger", "Neumann", "Schmitt"];

function adultBirth(random) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const latest = new Date(today);
  latest.setFullYear(latest.getFullYear() - 18);
  const earliest = new Date(today);
  earliest.setFullYear(earliest.getFullYear() - 70);
  const spanDays = Math.max(1, Math.round((latest.getTime() - earliest.getTime()) / 86400000));
  const offset = (random[0] + random[1]) % spanDays;
  const picked = new Date(earliest);
  picked.setDate(picked.getDate() + offset);
  if (picked > latest) return latest;
  return picked;
}

export function generatePerson() {
  const random = new Uint32Array(6);
  crypto.getRandomValues(random);
  const givenName = GIVEN_NAMES[random[0] % GIVEN_NAMES.length];
  const familyName = FAMILY_NAMES[random[1] % FAMILY_NAMES.length];
  const born = adultBirth([random[2], random[3]]);
  return {
    givenName,
    familyName,
    fullName: `${givenName} ${familyName}`,
    honorific: random[4] % 2 === 0 ? "Frau" : "Herr",
    birthDay: String(born.getDate()).padStart(2, "0"),
    birthMonth: String(born.getMonth() + 1).padStart(2, "0"),
    birthYear: String(born.getFullYear()),
  };
}
