#!/bin/bash
# Gino: prepara la compilazione sui Mac di GitHub.
#
# Questo script lo lancia Emanuele, non l'assistente: tocca la chiave privata
# di firma e crea un repository pubblico, due azioni che l'assistente non ha
# il permesso di fare.
#
# Non stampa mai il contenuto di un segreto: dice solo cosa e' riuscito.
set -e

REPO="unvrslabs/gino"
CONFIG="$HOME/Developer/_segreti/gino-configuration.json"
CHIAVE_ASC="$HOME/.config/asc/AuthKey_4GAYKQZSHX.p8"
KID="4GAYKQZSHX"
ISS="6e1d4af9-8b65-4825-80f6-53080107e596"

cd "$HOME/Developer/gino-ios"
umask 077
LAVORO=$(mktemp -d)
trap 'rm -rf "$LAVORO"' EXIT

echo "1/5  repository pubblico"
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "     c'e' gia'"
else
  # 'unvrslabs' e' un account personale, non un'organizzazione: niente --org,
  # il fork finisce comunque sull'account con cui gh e' collegato.
  gh repo fork TelegramMessenger/Telegram-iOS --fork-name gino \
    --clone=false --default-branch-only
  sleep 8
fi

echo "2/5  carico le nostre modifiche"
git remote remove gino 2>/dev/null || true
git remote add gino "https://github.com/$REPO.git"
git push -q gino HEAD:refs/heads/gino --force
gh repo edit "$REPO" --default-branch gino >/dev/null 2>&1 || true
echo "     ramo 'gino' caricato"

echo "3/5  esporto il certificato di firma dal portachiavi"
echo "     (se macOS chiede conferma, dai Consenti)"
PWD12=$(openssl rand -hex 24)
security export -t identities -f pkcs12 -P "$PWD12" -o "$LAVORO/dist.p12" -k login.keychain-db
echo "     esportato, $(wc -c < "$LAVORO/dist.p12") byte"

echo "4/5  impacchetto profili e configurazione"
tar czf "$LAVORO/profili.tgz" -C . codesigning
[ -f "$CONFIG" ]     || { echo "     MANCA $CONFIG"; exit 1; }
[ -f "$CHIAVE_ASC" ] || { echo "     MANCA $CHIAVE_ASC"; exit 1; }

echo "5/5  scrivo i segreti su GitHub"
base64 -i "$LAVORO/dist.p12"    | gh secret set CERT_DISTRIBUZIONE_P12 --repo "$REPO"
printf '%s' "$PWD12"            | gh secret set CERT_DISTRIBUZIONE_PWD --repo "$REPO"
base64 -i "$LAVORO/profili.tgz" | gh secret set PROFILI_TGZ            --repo "$REPO"
base64 -i "$CONFIG"             | gh secret set CONFIGURAZIONE_JSON    --repo "$REPO"
base64 -i "$CHIAVE_ASC"         | gh secret set ASC_AUTHKEY_P8         --repo "$REPO"
printf '%s' "$KID"              | gh secret set ASC_KEY_ID             --repo "$REPO"
printf '%s' "$ISS"              | gh secret set ASC_ISSUER_ID          --repo "$REPO"

echo
echo "FATTO. Segreti caricati:"
gh secret list --repo "$REPO" | awk '{print "  -", $1}'
echo
echo "Adesso l'assistente puo' lanciare la compilazione."
