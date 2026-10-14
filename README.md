# Bit.Eidon
**Eidon** ist eine Browser-Erweiterung, die Registrierungsformulare automatisch erkennt und auf Wunsch eine Wegwerf-E-Mail-Adresse, einen zufälligen Namen und ein sicheres Passwort generiert.  Der Name leitet sich vom griechischen *Eidolon* (Trugbild oder Doppelgänger) ab und steht für eine digitale Scheinidentität, die deine echte Identität schützt

## Verfahren

Eidon erkennt ein Registrierungsformular auf der Seite und zeigt eine Karte. Die Karte nennt den Anbieter und, wenn schon eine Identität für diese Website gespeichert ist, deren Adresse und Namen. Das Passwort steht nicht auf der Karte. Vor der Bestätigung wird nichts ins Formular geschrieben. Ein neues Postfach gibt es zu diesem Zeitpunkt noch nicht.

Bevor Zugangsdaten lesbar sind, muss die Sperre gesetzt oder entsperrt sein. Die Sperre liegt im Popup. Startet die Aktion auf der Website und die Sitzung hat noch keinen Schlüssel, öffnet der Service Worker die Sperrseite. Die Website sieht die Eingabe nicht.

„Ausfüllen“ schreibt die Felder und sendet das aktuelle Formular nicht. „Ausfüllen und senden“ schreibt die Felder und sendet ab. Danach werden spätere Schritte derselben Seite bis zu zehn Minuten weiter ausgefüllt und dann abgesendet. Ein Login bekommt Adresse und Passwort und wird nicht abgesendet. Für dieselbe Website wird die zuletzt genutzte gespeicherte Identität angeboten. „Neu“ legt eine andere an, „Andere“ zeigt die nächste passende. Eine Folge-Seite auf derselben Website übernimmt die Identität ohne neue Frage, wenn die Adresse schon im Feld steht, wenn es die gerade bestätigte Sitzungs-Identität ist, oder wenn der Eintrag höchstens sechs Stunden alt ist. Ein Bestätigungscode wird nur in das bestätigte Formular eingetragen. Der Posteingang bleibt offen und prüft neue Nachrichten, solange er sichtbar ist.

Lokal verschlüsselt liegen das Website-Passwort und das Passwort des Postfachs (PBKDF2 und AES-GCM). Salt, Runden und ein Prüfwert liegen daneben. Der abgeleitete Schlüssel und der Bearer-Token liegen nur in der Sitzung. Nach einem Browser-Neustart holt die Erweiterung den Token über die Anmeldung beim Anbieter neu. An mail.tm oder mail.gw gehen die Wegwerfadresse, das Postfach-Passwort und der Abruf der Nachrichten.

mail.tm behält Nachrichten etwa 7 Tage. Das Konto führt diese Erweiterung nicht als abgelaufen. mail.gw ist der Fallback: Konto und Nachrichten laufen nach 10 Minuten ab.

Dieselbe Website ist derselbe Hostname ohne führendes `www`, mit gleichem Schema. Ein abweichender Port zählt getrennt. Subdomains gelten nicht als dieselbe Website. Die Origin kommt aus der Seiten-URL des Content-Scripts, nicht aus einer mitgeschickten Angabe.

Eine Sicherung ist eine JSON-Datei mit Salt, Runden, Prüfwert und den Einträgen, wie sie lokal liegen. Adresse, Name und Origin stehen darin im Klartext, die Passwörter als Ciphertext. Sitzungsschlüssel und Bearer-Token sind nicht enthalten. Dieselben Salt und Runden übernehmen die Ciphertexte. Eine andere Sperre wird nur angehängt, wenn Eidon entsperrt ist, und dann neu verschlüsselt. Eine vergessene Sperre macht die Sicherung unlesbar.

Was nicht passiert: keine AGB und keine Marketing-Checkbox, kein Absenden eines Logins, kein Treffer über Subdomains, kein Ausfüllen vor der Bestätigung, keine gespeicherte Seiten-URL, kein Minuten-Alarm im Hintergrund, keine externen Bilder in Mails.

„Lokal löschen“ entfernt nur den Eintrag in Eidon. Das Postfach-Passwort ist danach weg, das Postfach beim Anbieter lässt sich nicht mehr löschen. „Postfach löschen“ löscht das Postfach beim Anbieter, soweit er erreichbar ist, und entfernt den Eintrag. Das Konto auf der Website bleibt in beiden Fällen bestehen. Eine vergessene Sperre macht die lokalen Geheimnisse unlesbar. „Sperre zurücksetzen“ löscht nur die lokale Kopie und sagt das vorher. Die Postfächer beim Anbieter bleiben bestehen.

Die Erweiterung muss Formulare auf beliebigen Seiten erkennen, deshalb läuft das Content-Script auf allen URLs. Formulare in Iframes werden nicht erkannt, auch wenn der Iframe dieselbe Origin hat.

KI-Disclaimer:
Der Code für diese Erweiterung wurde von KI geschrieben und vom Entwickler angepasst
