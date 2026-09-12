# Microsoft Store listing — createflow Dongle

Draft for the Partner Center submission (store ID 9P014D85B5KV). Kept here so the wording
is reviewable and reusable for the next version instead of living only in a web form.

Both languages are declared in the appx manifest (`de-DE`, `en-US`), so both listings are
filled in. German is the primary market.

---

## Deutsch (de-DE)

**Kurzbeschreibung** (max. 500 Zeichen)

> Macht aus einem nRF52840-USB-Stick einen Funkempfänger für die Naya-Create-Tastatur. Ein
> Klick spielt die Firmware auf, danach meldet sich der Stick am Rechner als gewöhnliche
> Tastatur, Maus und Mediensteuerung.

**Beschreibung**

> Die Naya Create wird mit einem Dongle ausgeliefert, dessen Firmware nie fertig wurde. Dieses
> Werkzeug schließt die Lücke: Es spielt eine freie Firmware auf einen nRF52840-USB-Stick, der
> sich anschließend per Bluetooth mit der Tastatur verbindet und am Rechner als ganz normale
> Tastatur, Maus und Mediensteuerung erscheint.
>
> Tasten, Touchpad, Drehregler und Medientasten funktionieren.
>
> **So läuft es ab**
>
> Stick einstecken — fabrikneu startet er direkt im Bootloader, die LED pulsiert rot. Keine
> Taste drücken, keinen Treiber installieren. Dann in der App auf „Flash firmware" klicken.
> Nach etwa zehn Sekunden startet der Stick als Dongle neu.
>
> Updates laufen genauso. Die App schickt den laufenden Dongle über USB zurück in den
> Bootloader, ein Reset-Knopf ist nie nötig.
>
> **Was Sie brauchen**
>
> Einen nRF52840-USB-Stick, etwa den EBYTE E104-BT5040U für rund 10 Euro. Nordics eigenes
> nRF52840 Dongle (PCA10059) funktioniert ebenso, und grundsätzlich jeder nRF52840-Stick mit
> Nordics offenem DFU-Bootloader. Dazu eine Naya Create mit einem freien Bluetooth-Platz.
>
> **Offen und nachprüfbar**
>
> Firmware und App stehen unter der Apache-2.0-Lizenz offen einsehbar auf GitHub. Die App
> sammelt keine Daten und sendet nichts über das Netz; sie spricht ausschließlich mit dem
> Stick am USB-Anschluss.
>
> Dieses Werkzeug stammt nicht von Naya und steht in keiner Verbindung zu diesem Unternehmen.
> „Naya Create" wird nur genannt, um zu beschreiben, mit welcher Tastatur der Dongle
> zusammenarbeitet.

**Produktfeatures** (je max. 200 Zeichen)

- Firmware mit einem Klick aufspielen, in etwa zehn Sekunden
- Updates ohne Reset-Knopf: Die App schickt den Dongle selbst in den Bootloader
- Tasten, Touchpad, Drehregler und Medientasten
- Arbeitet mit gewöhnlichem Bluetooth HID, kein eigener Treiber nötig
- Quelloffen unter Apache 2.0
- Sammelt keine Daten und sendet nichts über das Netz

**Suchbegriffe** (max. 7)

Naya Create, Dongle, nRF52840, Tastatur, Firmware, Bluetooth, Flasher

---

## English (en-US)

**Short description**

> Turns an nRF52840 USB stick into a wireless receiver for the Naya Create keyboard. One click
> writes the firmware; the stick then shows up on your computer as an ordinary keyboard, mouse
> and media controller.

**Description**

> The Naya Create ships with a dongle whose firmware was never finished. This tool fills the
> gap: it writes open firmware onto an nRF52840 USB stick, which then pairs with the keyboard
> over Bluetooth and appears on your computer as a plain keyboard, mouse and media controller.
>
> Keys, touchpad, dials and media keys all work.
>
> **How it goes**
>
> Plug the stick in — fresh out of the box it boots straight into the bootloader, the LED
> pulsing red. No button to press, no driver to install. Click "Flash firmware" in the app.
> About ten seconds later the stick reboots as the dongle.
>
> Updates work the same way. The app sends the running dongle back into the bootloader over
> USB, so you never need to touch a reset button.
>
> **What you need**
>
> An nRF52840 USB stick, such as the EBYTE E104-BT5040U for around $10. Nordic's own nRF52840
> Dongle (PCA10059) works too, as should any nRF52840 stick shipping Nordic's open DFU
> bootloader. Plus a Naya Create with a spare Bluetooth slot.
>
> **Open and verifiable**
>
> Firmware and app are published under the Apache 2.0 licence on GitHub. The app collects no
> data and sends nothing over the network; it talks only to the stick on your USB port.
>
> This tool does not come from Naya and is not affiliated with that company. "Naya Create" is
> named only to describe which keyboard the dongle works with.

**Product features**

- Write the firmware with one click, in about ten seconds
- Updates without a reset button: the app sends the dongle into the bootloader itself
- Keys, touchpad, dials and media keys
- Uses ordinary Bluetooth HID, no custom driver
- Open source under Apache 2.0
- Collects no data, sends nothing over the network

**Search terms**

Naya Create, dongle, nRF52840, keyboard, firmware, Bluetooth, flasher

---

## Properties

| Field | Value |
|---|---|
| Category | Developer tools → Utilities (alternative: Utilities & tools) |
| Price | Free |
| Markets | All, unless a reason appears to narrow them |
| Copyright | © 2026 Sünkel Media & Merch |
| Support contact | See the contact details on the developer account |

## Age rating

The questionnaire is answered in Partner Center. Every content question is "no" for this
app: no violence, no sexual content, no gambling, no user-generated content, no chat, no
adverts, no purchases. It shares no personal data and has no unmoderated communication. The
expected outcome is the lowest rating.

## Privacy policy

`PRIVACY.md` in the repository root, German and English. Once pushed, the URL for Partner
Center is:

> https://github.com/mediaandmerch/createflow-dongle/blob/main/PRIVACY.md

It names the one network call the app makes (api.github.com for the version check, off by
default in the Store build) rather than claiming the app never touches the network — that
claim would be false while the check is on, and a privacy policy that overstates is worse than
none.

## Still needed before submission

1. **Screenshot.** At least one is mandatory, PNG, minimum 1366 × 768, and it has to be taken
   on Windows with the app running — a macOS window in a Windows Store listing would be both
   obvious to the reviewer and misleading to buyers. This needs a logged-in Windows session,
   which SSH alone cannot provide.
2. **Push.** The privacy policy URL only resolves once the repository is pushed.
