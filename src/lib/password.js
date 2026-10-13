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

export function generatePerson() {
  const random = new Uint32Array(3);
  crypto.getRandomValues(random);
  const givenName = GIVEN_NAMES[random[0] % GIVEN_NAMES.length];
  const familyName = FAMILY_NAMES[random[1] % FAMILY_NAMES.length];
  return {
    givenName,
    familyName,
    fullName: `${givenName} ${familyName}`,
    honorific: random[2] % 2 === 0 ? "Frau" : "Herr",
    birthDay: "15",
    birthMonth: "03",
    birthYear: "1994",
  };
}
