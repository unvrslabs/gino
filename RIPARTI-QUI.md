# Pulsar — riparti qui

Telegram iOS forkato e rimarchiato, agganciato ai server veri di Telegram.
Cartella: `~/Developer/pulsar-ios`

## Stato al 22/09/2026, 07:10

Il pacchetto **c'e' ed e' firmato**: `bazel-bin/Telegram/Telegram.ipa` (71 MB).
Nome visibile **Pulsar**, `dev.unvrslabs.pulsar`, versione 12.9.2 build 1, iOS 15 minimo,
sei estensioni dentro, team 6C42B7B97B.

## 🔴 L'UNICA cosa che manca

La **scheda dell'app su App Store Connect**. Non si crea via API (403 FORBIDDEN,
`apps` non permette CREATE): si fa solo dal sito, con l'accesso di Emanuele.

1. Emanuele entra su appstoreconnect.apple.com
2. App → `+` → Nuova app → iOS → Nome `Pulsar` → Lingua Italiano →
   ID pacchetto `dev.unvrslabs.pulsar` → SKU `PULSAR2026` → Accesso completo
3. Poi, da qui: `bash scripts/carica-testflight.sh` (sei secondi)
4. TestFlight → Test interni → invita `emanuele@maccari.io` (niente revisione Apple)

## Come si ricostruisce

```
python3 build-system/Make/Make.py \
  --cacheDir="$HOME/telegram-bazel-cache" \
  --bazel="$(which bazelisk)" \
  --overrideXcodeVersion --overrideBazelVersion \
  build \
  --configurationPath="$HOME/Developer/_segreti/pulsar-configuration.json" \
  --codesigningInformationPath="$HOME/Developer/pulsar-ios/codesigning" \
  --buildNumber=1 --configuration=release_arm64
```

Circa 15 minuti a freddo. Le chiavi Telegram stanno in
`~/Developer/_segreti/pulsar-configuration.json` (permessi 600, fuori dal repo).

## 🔴 Le sette correzioni per Xcode 27 (senza queste non compila)

Telegram fissa **Xcode 26.2** in `versions.json`. Sul Mac c'e' la **27 beta**.
Si forza con `--overrideXcodeVersion`, poi servono queste:

1. **dav1d**: `third-party/dav1d/build-dav1d-bazel.sh` scriveva a mano
   `/Applications/Xcode.app`, che qui si chiama `Xcode-beta.app`. Bug loro: per il
   simulatore usano `xcode-select -p`, per il telefono no. Copiata la stessa cura.
2. **iOS minimo 13 -> 15** in `Telegram/BUILD` e `submodules/TextFormat/BUILD`:
   la libreria C++ di Xcode 27 rifiuta tutto sotto iOS 15.
3. **`.bazelrc`**: `ImplicitStrongCapture` abbassata ad avviso (diagnostica nuova).
4. **Tolto `-suppress-warnings`** da `submodules/TelegramCore/FlatBuffers/BUILD`,
   `third-party/Swift2D/BUILD`, `third-party/XMLCoder/BUILD`: litigava col punto 3.
5. **`.bazelrc`**: deprecazioni ad avviso (`-Wno-error=deprecated-declarations` per
   C/ObjC, gruppo `DeprecatedDeclaration` per Swift). Conseguenza del punto 2.
6. **`.bazelrc`**: gruppo `NoUseUnstructuredThrowingTask` ad avviso.
   🔴 Il nome NON e' quello del link della documentazione
   (`no-use-throwing-unstructured-task` -> si direbbe `NoUseThrowingUnstructuredTask`,
   ma il compilatore vuole `NoUseUnstructuredThrowingTask`). Si scopre solo provando:
   `xcrun swiftc -typecheck -Wwarning <nome> file.swift` avvisa se il gruppo non esiste.
7. **`ChatControllerNode.swift`**: `EmptyInputView` e' definita **pubblica due volte**
   dentro Telegram (in `ChatEntityKeyboardInputNode` e in `TextFieldComponent`), identica.
   Xcode 27 non sceglie piu'. 🔴 Qualificare col modulo NON funziona: in tutti e due i
   casi modulo e classe interna hanno lo stesso nome e vince la classe. Risolto
   dichiarando una `PulsarEmptyInputView` locale (sono quattro righe).

Ogni interruttore nuovo in `.bazelrc` invalida la cache dei moduli Swift: si rifa'
da ~4.800 pezzi su 6.001.

## Trappole del sistema di compilazione

- `--bazelArguments` di `Make.py` **e' dichiarato ma non usato**: gli argomenti extra
  per bazel vanno messi in `.bazelrc`.
- Non esiste `--swiftcopt`: si usa `--@build_bazel_rules_swift//swift:copt=...`,
  ripetibile una volta per argomento.
- `build:macos --strategy=...` batte `build --strategy=...`: per cambiare strategia
  va modificata la riga `:macos`.
- Il worker Swift non stampa l'errore vero. Per vederlo: rieseguire a mano il comando
  con `DEVELOPER_DIR` e `SDKROOT` impostati (vedi `/tmp/vedi-errore-ui.sh` del 22/09).
- `--xcodeManagedCodesigning` vale solo dentro Xcode: da riga di comando servono i
  profili veri, uno per estensione.

## Cosa c'e' e cosa no in un fork

Tutto quello che vive sui server di Telegram funziona: chiamate voce e video, bot,
mini app, canali, chat segrete, vocali, adesivi.
Non funziona quello che passa dalla cassa di Apple: comprare Premium e ricaricare
le Stars (i product id sono dell'account di Telegram).
I permessi speciali (VoIP senza limiti, CarPlay, filtro notifiche, Apple Pay, Siri,
iCloud) si spengono da soli nel loro BUILD quando l'identificativo non e' il loro:
Apple non ha niente da contestare.

## Da fare dopo

- Icona: ora e' ancora quella di Telegram. 🔴 Il loro README chiede esplicitamente di
  non usarla. Va rifatta prima di qualunque uso vero.
- Lista bianca dei contatti (il "trucco" della stanza chiusa): filtro nel client, piu'
  niente nome utente pubblico e numero chiuso nelle impostazioni Telegram.
- Publicazione del codice modificato: la licenza lo richiede. Repo `pulsar` sotto
  l'account `unvrslabs`.
