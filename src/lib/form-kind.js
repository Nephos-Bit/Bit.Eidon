(function (root) {
  const SIGNUP = /sign\s*up|signup|register|registrieren|create\s+account|konto\s+erstellen|get\s+started/i;
  const LOGIN = /sign\s*in|log\s*in|login|anmelden|einloggen/i;
  const CONTINUE = /fortfahren|mit\s+e-?mail|\bweiter\b|\bcontinue\b|\bnext\b|loslegen/i;
  const SOCIAL = /google|apple|facebook|github|microsoft|\bsso\b|passkey/i;
  const NEWSLETTER = /newsletter|abonnieren|subscribe|unsubscribe/i;

  function hasEmailContinue(continueText) {
    return String(continueText)
      .split("\n")
      .some((line) => CONTINUE.test(line) && !SOCIAL.test(line) && !NEWSLETTER.test(line));
  }

  function classifyForm({
    text = "",
    passwordCount = 0,
    hasNewPassword = false,
    hasCurrentPassword = false,
    continueText = "",
  }) {
    if (hasNewPassword || passwordCount >= 2 || SIGNUP.test(text)) return "signup";
    if (passwordCount === 0 && hasEmailContinue(continueText)) return "signup";
    if (hasCurrentPassword || LOGIN.test(text) || passwordCount === 1) return "login";
    return null;
  }

  function classifyNameField({ hint = "", autocomplete = "", tag = "input" }) {
    const auto = String(autocomplete).toLowerCase();
    const text = String(hint).toLowerCase();
    if (tag === "select" && /anrede|salutation|honorific/.test(text)) return "honorific";
    if (auto.includes("honorific")) return "honorific";
    if (/user.?name|benutzername|e-?mail|passwor|company|firma|organisation|telefon|phone/.test(text)) return null;
    if (auto.includes("given-name") || /vorname|first[\s_-]?name|given[\s_-]?name|\bfname\b/.test(text)) return "given";
    if (
      auto.includes("family-name") ||
      auto.includes("surname") ||
      /nachname|last[\s_-]?name|family[\s_-]?name|surname|\blname\b/.test(text)
    ) {
      return "family";
    }
    if (auto === "name" || /vollst[aä]ndiger\s+name|vollname|full[\s_-]?name/.test(text)) return "full";
    return null;
  }

  function fullDateFormat(text) {
    if (/tt\s*[./-]\s*mm\s*[./-]\s*jjjj|dd\s*[./]\s*mm\s*[./]\s*yyyy|dd\s*-\s*mm\s*-\s*yyyy/.test(text)) return "date-de";
    if (/mm\s*[./-]\s*dd\s*[./-]\s*yyyy/.test(text)) return "date-us";
    if (/yyyy\s*[./-]\s*mm\s*[./-]\s*dd|jjjj\s*[./-]\s*mm\s*[./-]\s*tt/.test(text)) return "date";
    return null;
  }

  function classifyBirthField({ hint = "", placeholder = "", autocomplete = "", type = "" }) {
    const auto = String(autocomplete).toLowerCase();
    const place = String(placeholder).trim().toLowerCase();
    const text = `${hint} ${place} ${auto}`.toLowerCase();
    if (auto.includes("bday-day") || /^(dd|tt)$/.test(place)) return "day";
    if (auto.includes("bday-month") || place === "mm") return "month";
    if (auto.includes("bday-year") || /^(yyyy|jjjj|jj)$/.test(place)) return "year";
    if (type === "date") return "date";
    const format = fullDateFormat(text);
    if (format) return format;
    if (auto === "bday" || /geburtsdatum|date of birth|birth\s*date|\bdob\b|\bbirthday\b/.test(text)) {
      return /geburtsdatum|jjjj|tt\s*[./-]\s*mm/.test(text) ? "date-de" : "date";
    }
    if (/\b(geburtstag|birth\s+day)\b/.test(text)) return "day";
    if (/\b(geburtsmonat|birth\s+month)\b/.test(text)) return "month";
    if (/\b(geburtsjahr|birth\s+year)\b/.test(text)) return "year";
    return null;
  }

  function isTermsLabel(text) {
    return /geschäftsbeding|geschaftsbeding|\bagb\b|nutzungsbeding|terms of|terms and|bedingungen|akzeptier|bestätige|bestaetige|einverstanden/.test(
      String(text).toLowerCase(),
    );
  }

  function isMarketingLabel(text) {
    return /newsletter|marketing|werbung|angebote|sonderaktion/.test(String(text).toLowerCase());
  }

  function isNewsletterText(text) {
    const value = String(text || "").toLowerCase();
    if (/passwor|vorname|nachname|geburt|registrier/.test(value)) return false;
    return NEWSLETTER.test(value);
  }

  function looksLikePasswordSetup({ hint = "", autocomplete = "", context = "" }) {
    const auto = String(autocomplete).toLowerCase();
    const text = `${hint} ${context}`.toLowerCase();
    if (auto.includes("current-password")) return false;
    if (auto.includes("new-password")) return true;
    if (/passwort eingeben|passwort festlegen|neues passwort|passwort erstellen|create password|choose a password|set a password/.test(text)) {
      return true;
    }
    return /großbuchstabe|sonderzeichen|kleinbuchstabe/.test(text);
  }

  function looksLikeCodeField({ hint = "", autocomplete = "" }) {
    const auto = String(autocomplete).toLowerCase();
    const text = String(hint).toLowerCase();
    if (auto.includes("one-time-code")) return true;
    return /verifiz|bestätigungscode|bestaetigungscode|security code|one-time|einmalcode|\botp\b|\bcode\b/.test(text);
  }

  root.TrashmailForm = {
    classifyForm,
    classifyNameField,
    classifyBirthField,
    looksLikePasswordSetup,
    looksLikeCodeField,
    isTermsLabel,
    isMarketingLabel,
    isNewsletterText,
    isSignupLabel(text) {
      return SIGNUP.test(text || "");
    },
    isContinueLabel(text) {
      return CONTINUE.test(text || "") && !SOCIAL.test(text || "");
    },
    isSocialLabel(text) {
      return SOCIAL.test(text || "");
    },
    isLoginLabel(text) {
      return LOGIN.test(text || "") && !SOCIAL.test(text || "");
    },
  };
})(globalThis);
