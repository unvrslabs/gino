# Gino — riparti qui

Telegram iOS forkato e rimarchiato, agganciato ai **server veri di Telegram**.
Cartella locale `~/Developer/gino-ios`, repo pubblico `github.com/unvrslabs/gino` (ramo `gino`).

## Stato al 22/09/2026, 11:30

🟢 **Su TestFlight e funzionante.** Build 10, versione 12.9.2, `dev.unvrslabs.pulsar`.
Nome sullo store **Messaggino** (su App Store Connect). Il bundle id resta `dev.unvrslabs.pulsar`: Apple non lo fa cambiare, servirebbe un'app nuova.
Nome sotto l'icona: **Gino** dalla build 11. Gruppo interno `Squadra UNVRS`, invitati
`emanuele@maccari.io` e `emanuele@unvrslabs.dev`. App su App Store Connect: id **6814719172**.

## 🔴 Come si pubblica una versione nuova

```
gh workflow run gino.yml --repo unvrslabs/gino -f numero=11
```

Un comando, da qualunque macchina. Il numero va **alzato ogni volta**: Apple rifiuta
due build con lo stesso. Costruisce, controlla, carica, **assegna al gruppo** e aspetta
che sia `IN_BETA_TESTING`.

🔴 **Caricare non basta.** Il gruppo `Squadra UNVRS` ha `hasAccessToAllBuilds: false`, e
quell'attributo **non si puo' piu' cambiare** dopo la creazione (Apple risponde 409, «can
not be included in a 'UPDATE' operation»). Senza assegnazione la build resta
`READY_FOR_BETA_TESTING` e sul telefono non compare: e' successo alle build 11 e 12 del
22/09/2026, caricate e mai consegnate. Ci pensa `scripts/consegna-ai-tester.mjs`, chiamato
dal workflow. Catena da verificare: `processingState` VALID → build assegnata al gruppo →
`internalBuildState` = `IN_BETA_TESTING`.

🔴 **La rete di casa verso `api.appstoreconnect.apple.com` cade spesso**: una sola chiamata
torna `fetch failed` o, peggio, una lista incompleta che sembra vera. Sempre con ritentativi.

## 🔴 Perché NON si compila sul Mac di Emanuele

Il Mac gira una **beta di macOS** (build `26A5425a`). Da lì discende tutto:

- con una beta di Xcode, Apple **rifiuta il caricamento**: errore `90534`,
  «Unsupported SDK or Xcode version»
- Xcode 26.2 rilasciato **non si avvia** su quel sistema (`-10664`, versione
  incompatibile), quindi macOS non lo registra, quindi `xcode-locator` di Bazel
  non lo trova e Bazel prende l'unico che vede: la beta. Cerchio chiuso.
- Vale anche per la **Release Candidate**: provata, stesso errore.
- `softwareupdate -l` offre solo altre beta: il Mac è iscritto al programma beta.

Non è un problema di Gino: **nessuna app di UNVRS si può caricare da questo Mac**
finché c'è la beta. La compilazione in cloud serve per tutte.

Xcode 26.2 resta installato in `/Applications/Xcode.app` (inutile in locale).
La beta è tornata al suo posto in `/Applications/Xcode-beta.app`.
Per usarla: `sudo xcode-select -s /Applications/Xcode-beta.app`.

## 🔴 Le cinque trappole di GitHub Actions, tutte incontrate

1. **L'etichetta della macchina è `macos-26`**, non `macos-26-arm64`: quello è il nome
   dell'immagine. Con il nome sbagliato il lavoro resta **in coda per sempre** senza
   errore (38 minuti buttati). L'elenco vero sta nel README di `actions/runner-images`.
2. **Sotto-moduli con indirizzi relativi** (`url=../tgcalls.git`): su un fork si
   risolvono sotto il NOSTRO account e non esistono. Vanno resi assoluti verso
   `TelegramMessenger`. Riguarda `tgcalls` e `rlottie`.
3. **Bazelisk al primo avvio** stampa i messaggi di scaricamento insieme alla versione,
   e il controllo di Telegram («deve cominciare per `bazel `») lo rifiuta dicendo che
   non è un binario valido. Si chiama due volte `bazelisk --version` prima.
4. **L'archivio dei profili contiene già la cartella `codesigning`**: va estratto nella
   radice (`tar xz -C .`), non dentro `codesigning`. Se annidato, la compilazione dice
   «Could not find a valid aps-environment entitlement», che manda fuori strada.
5. **Il runner ha Xcode 26.2 preinstallato** in `/Applications/Xcode_26.2.app`, la
   versione esatta che Telegram richiede in `versions.json`. Basta `xcode-select -s`.

## 🔴 L'icona vera NON sta in DefaultAppIcon.xcassets

Scoperto il 22/09/2026. L'icona del piccione era stata messa in
`Telegram-iOS/DefaultAppIcon.xcassets/AppIconLLC.appiconset`, ma:

- quel catalogo è **commentato fuori** dalle risorse (`Telegram/BUILD:1786`)
- `app_icons` prendeva da `Telegram-iOS/Telegram.icon`, il formato Icon Composer
  di Xcode 26 (`icon.json` + `Oval.svg` + `Plane.svg`): **l'aeroplanino di Telegram**

Quindi la build 10 su TestFlight aveva ancora l'icona loro. Corretto mettendo
`app_icons = [":DefaultAppIcon"]` (`Telegram/BUILD:1780`). `rules_apple` accetta sia
`.appiconset/` sia `.icon/`, vedi `_STANDARD_ICONS` in
`build-system/bazel-rules/rules_apple/apple/internal/partials/app_assets_validation.bzl`.

🔴 **Niente cartelle di backup dentro un `.xcassets`**: actool le legge. Il backup
dell'icona Telegram sta in `Telegram-iOS/_icone-vecchie/`.

Le icone alternative (Impostazioni ▸ Icona app) sono ancora gli aeroplanini di
Telegram: stanno nelle cartelle `Telegram-iOS/*.alticon/`, elencate in
`alternate_icon_folders`.

🔴 **Mai riempire la casella iPad `76x76` a `1x`** nel `Contents.json`: Telegram la
lascia senza file **apposta**. Se ci metti un PNG, actool ferma la build con
«76x76@1x app icons only apply to iPad apps targeting releases of iOS prior to 10.0»
(build 11, 22/09/2026, persi 18 minuti). L'avviso `ITMS-90892` riguarda 152 e 167,
cioè `76x76@2x` e `83.5x83.5@2x`, che ci sono già.

## 🔴 Siri: dichiarare ESATTAMENTE gli intent che hanno le frasi

I 19 `Telegram-iOS/*.lproj/AppIntentVocabulary.plist` contengono frasi di esempio
**solo per `INSendMessageIntent`**. Da qui discendono due errori opposti:

- se dichiari un intent **senza** frasi → `ITMS-90626 No example phrase was provided`,
  un avviso per ogni intent per ogni lingua (76 righe: erano `INStartAudioCallIntent`,
  `INSearchForMessagesIntent`, `INSetMessageAttributeIntent`, `INSearchCallHistoryIntent`).
  Fastidioso ma **non blocca**
- se togli un intent **lasciando** le sue frasi → `ITMS-90626 contains a phrase that
  belongs to unsupported intent`, e Apple **scarta la build in lavorazione**. È successo
  alle build 12 e 13 del 22/09/2026: `UPLOAD SUCCEEDED`, e poi mai comparse su ASC

🔴 **`NSSiriUsageDescription` è obbligatoria comunque**, anche con `enable_siri = False`
nella configurazione: il codice collega il framework Intents, e ad Apple basta quello
(`ITMS-90683`). Toglierla scarta la build.

🔴 **L'estensione intent non si può eliminare**: gestisce `SelectFriendsIntent` e
`SelectAvatarFriendsIntent`, cioè la scelta dei contatti del widget
(`SiriIntents/IntentHandler.swift`).

🔴 **Una build scartata in lavorazione non lascia traccia nell'API**: non compare fra i
`/builds`, non c'è nessuno stato da interrogare. L'unico segnale è l'email di Apple.
Distinguere «you may want to correct» (avvisi, consegnata) da «Please correct the
following issues» (scartata).

## Le nostre modifiche a Telegram (tutte nel commit)

- nome visibile **Gino** in `Telegram/BUILD`: due `CFBundleDisplayName` più il
  `CFBundleName` dell'app principale (🔴 NON quelli dei framework, che restano loro)
- `app_icons` spostato su `:DefaultAppIcon` (vedi la trappola dell'icona qui sopra)
- icona in `Telegram/Telegram-iOS/DefaultAppIcon.xcassets/AppIconLLC.appiconset`:
  18 file rigenerati dal ritratto del piccione a 2048 con zoom 1.12, master su
  `~/Desktop/hf_20260922_071033_*.png`. Aggiunta la casella iPad 76x76 1x
- `third-party/dav1d/build-dav1d-bazel.sh`: usa `xcode-select -p` invece del percorso
  scritto a mano `/Applications/Xcode.app`. **Bug loro**: per il simulatore lo facevano
  già, per il telefono no
- `submodules/TelegramUI/Sources/ChatControllerNode.swift`: `EmptyInputView` è definita
  **pubblica due volte** dentro Telegram (in `ChatEntityKeyboardInputNode` e in
  `TextFieldComponent`), identica. Risolto con una classe locale. 🔴 Qualificare col
  modulo NON funziona: in entrambi i casi modulo e classe interna hanno lo stesso nome
  e vince la classe
- `.gitmodules`: indirizzi assoluti (trappola 2)
- `.github/workflows/gino.yml`: la procedura

## Segreti

Su GitHub (`gh secret list --repo unvrslabs/gino`): `CERT_DISTRIBUZIONE_P12`,
`CERT_DISTRIBUZIONE_PWD`, `PROFILI_TGZ`, `CONFIGURAZIONE_JSON`, `ASC_AUTHKEY_P8`,
`ASC_KEY_ID`, `ASC_ISSUER_ID`.
Si rifanno con `bash scripts/prepara-cloud.sh` (lo lancia Emanuele: tocca la chiave
privata di firma). In locale le chiavi Telegram stanno in
`~/Developer/_segreti/gino-configuration.json`, permessi 600, fuori dal repo.

Identificativi: 7 (app più Share, Widget, NotificationContent, NotificationService,
SiriIntents, BroadcastUpload). Profili App Store in `codesigning/`, di sviluppo in
`codesigning-dev/`. Entrambe le cartelle sono ignorate da git.

## Cosa c'è e cosa no in un fork

Funziona tutto quello che vive sui server di Telegram: chiamate voce e video, bot,
mini app, canali, chat segrete, vocali, adesivi.
Non funziona quello che passa dalla cassa di Apple: comprare Premium e ricaricare le
Stars (i product id sono dell'account di Telegram). Il portafoglio TON non è nel
codice, è una mini app di terzi.
I permessi speciali (VoIP senza limiti, CarPlay, filtro notifiche, Apple Pay) si
spengono da soli quando l'identificativo non è il loro: Apple non ha niente da
contestare a un fork.

## Avvisi di Apple sulla build 10 (nessuno blocca)

- `ITMS-90068` iOS minimo 13: dalla primavera 2027 servirà 15. Alzarlo in
  `Telegram/BUILD` e `submodules/TextFormat/BUILD`, ma con Xcode 27 quel cambio
  fa scattare le deprecazioni come errori
- `ITMS-90626` frasi Siri in ottanta lingue: roba di Telegram, Siri è spento in
  configurazione, è rumore
- `ITMS-90683` manca `NSLocationAlwaysAndWhenInUseUsageDescription`

## Banco locale col simulatore — 🟢 FUNZIONA

Worktree `~/Developer/gino-simulatore`, ramo `banco-simulatore`. Serve a vedere le
modifiche in minuti invece di passare da TestFlight. Differisce da `master` **solo** per
le impostazioni dell'Xcode beta: `.bazelrc`, `minimum_os_version` a 15.0 in
`Telegram/BUILD` e `submodules/TextFormat/BUILD`, e `-suppress-warnings` tolto da tre BUILD.

```
cd ~/Developer/gino-simulatore
python3 build-system/Make/Make.py --overrideXcodeVersion --cacheDir ~/telegram-bazel-cache \
  build --configurationPath ~/Developer/_segreti/gino-configuration.json \
  --codesigningInformationPath "$PWD/codesigning-dev" --buildNumber=1 --configuration=debug_sim_arm64

APP=$(find -L bazel-out -maxdepth 14 -path "*Telegram_archive-root/Payload/Telegram.app" -type d | head -1)
xcrun simctl install <SIM> "$APP" && xcrun simctl launch <SIM> dev.unvrslabs.pulsar
```

🔴 **Il simulatore deve essere iOS 26, non iOS 27.** Su iOS 27 l'app crasha subito con
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`: quella versione pretende
l'adozione vera del ciclo di vita a scene e Telegram e' scritta col modello vecchio.
Mettere `UIApplicationSceneManifest` nel plist **non basta**, provato. Su iOS 26 lo stesso
controllo e' solo un avviso e l'app parte.

Simulatore gia' creato: `iPhone 17 Pro iOS26`, id `E371893B-416B-434C-AC5F-CA05B17B96EF`.
Runtime installati: iOS 26.0 (23A343) e iOS 27.0 (24A5408d).

### Le quattro trappole gia' pagate

1. **Un worktree non porta i sotto-moduli**: `git submodule update --init --recursive`
   nel banco. Sono 13, non riscarica niente perche' i dati sono gia' in locale.
2. **`codesigning/` e `codesigning-dev/` sono ignorate da git**, quindi nel worktree non
   ci sono: vanno copiate da `~/Developer/gino-ios`.
3. **`-suppress-warnings` va in conflitto** con il `-Wwarning` che serve alla beta:
   `error: conflicting options`. Va tolto da `FlatBuffers`, `Swift2D`, `XMLCoder`.
4. **Il bundle id e' `dev.unvrslabs.pulsar`**, non `ph.telegra.Telegraph`: lanciare con
   quello sbagliato da' `FBSOpenApplicationServiceErrorDomain code=4`.

### Da fare

Accedere una volta sola col numero di Emanuele sul simulatore: senza account collegato
non si vedono le impostazioni, quindi non si verifica niente di quello che tocchiamo li'.

## Da fare

- Lista bianca dei contatti: filtro nel client per vedere solo le persone in elenco,
  più niente nome utente pubblico e numero chiuso nelle impostazioni Telegram.
  🔴 La lista NON va scritta nell'app, va letta all'avvio da un file sul VPS
- Icone alternative: sostituire gli aeroplanini nelle cartelle `*.alticon/`
- Capire perché al primo avvio col cavo l'app si chiudeva (poi partiva lanciata dal Mac)

## Salvare la cache tra le corse

La prima build in cloud è durata **un'ora** perché compilava WebRTC e FFmpeg da zero.
Aggiungendo `actions/cache` su `~/bazel-cache` le successive scendono a pochi minuti.
Non fatto ancora.
