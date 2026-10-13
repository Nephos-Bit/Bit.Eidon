# Bit.Eidon
**Eidon** ist eine Browser-Erweiterung, die Registrierungsformulare automatisch erkennt und auf Wunsch eine Wegwerf-E-Mail-Adresse, einen zufälligen Namen und ein sicheres Passwort generiert.  Der Name leitet sich vom griechischen *Eidolon* (Trugbild oder Doppelgänger) ab und steht für eine digitale Scheinidentität, die deine echte Identität schützt

## Verfahren

Eidon erkennt ein Registrierungsformular auf der Seite und zeigt eine Karte. Die Karte nennt den Anbieter, eine erfundene Person und ein Website-Passwort. Ein neues Postfach gibt es zu diesem Zeitpunkt noch nicht. Adresse und Name können schon vor der Bestätigung im Formular stehen. Das Website-Passwort wird erst nach dem Klick eingesetzt.

Bevor Zugangsdaten lesbar sind, muss die Sperre gesetzt oder entsperrt sein. Die Sperre liegt im Popup. Startet die Aktion auf der Website und die Sitzung hat noch keinen Schlüssel, öffnet der Service Worker die Sperrseite. Die Website sieht die Eingabe nicht.

Zwei Aktionen: „Nur ausfüllen“ schreibt die Felder und öffnet den Posteingang. „Ausfüllen und senden“ schreibt die Felder und sendet das Formular, einschließlich eines Weiter-Klicks auf derselben Seite. Ein Login wird nur mit der Adresse befüllt und nicht abgesendet. Eine Folge-Seite zeigt dieselbe Karte mit der vorhandenen Adresse, statt still weiterzumachen. Ein Bestätigungscode wird nur in das bestätigte Formular eingetragen. Der Posteingang bleibt offen und prüft neue Nachrichten, solange er sichtbar ist.

Lokal verschlüsselt liegen das Website-Passwort und das Passwort des Postfachs (PBKDF2 und AES-GCM). Salt, Runden und ein Prüfwert liegen daneben. Der abgeleitete Schlüssel und der Bearer-Token liegen nur in der Sitzung. Nach einem Browser-Neustart holt die Erweiterung den Token über die Anmeldung beim Anbieter neu. An mail.tm oder mail.gw gehen die Wegwerfadresse, das Postfach-Passwort und der Abruf der Nachrichten.

mail.tm behält Nachrichten etwa 7 Tage. Das Konto führt diese Erweiterung nicht als abgelaufen. mail.gw ist der Fallback: Konto und Nachrichten laufen nach 10 Minuten ab.

Was nicht passiert: keine AGB und keine Marketing-Checkbox, kein stilles Absenden, kein automatisches Weiter nach „Nur ausfüllen“, kein Treffer über Subdomains, keine gespeicherte Seiten-URL, kein Minuten-Alarm im Hintergrund, keine externen Bilder in Mails.

Eine vergessene Sperre macht die lokalen Geheimnisse unlesbar. Remote löschen braucht das Postfach-Passwort und geht dann nicht mehr. „Sperre zurücksetzen“ löscht nur die lokale Kopie und sagt das vorher. Die Postfächer beim Anbieter bleiben bestehen.

Die Erweiterung muss Formulare auf beliebigen Seiten erkennen, deshalb läuft das Content-Script auf allen URLs. Formulare in Iframes werden nicht erkannt, auch wenn der Iframe dieselbe Origin hat.

KI-Disclaimer:
Der Code für diese Erweiterung wurde von KI geschrieben und vom Entwickler angepasst
