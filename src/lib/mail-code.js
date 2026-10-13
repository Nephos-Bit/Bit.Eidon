export function extractMailCode(text) {
  const source = String(text || "");
  const labeled = source.match(/(?:code|pin|otp|verifiz\w*|bestätig\w*|bestaetig\w*)\D{0,24}(\d{4,8})/i);
  if (labeled) return labeled[1];
  return source.match(/\b(\d{6})\b/)?.[1] || "";
}
