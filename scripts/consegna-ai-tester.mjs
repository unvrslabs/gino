// Aspetta che Apple digerisca la build appena caricata e la assegna al gruppo
// TestFlight, sennò resta READY_FOR_BETA_TESTING e non la vede nessuno.
//
// 🔴 Il gruppo ha hasAccessToAllBuilds = false e quell'attributo NON si può
// cambiare dopo la creazione ("can not be included in a 'UPDATE' operation"),
// quindi ogni build va assegnata a mano. Questo script lo fa da sé.
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'

const KID = process.env.ASC_KEY_ID
const ISS = process.env.ASC_ISSUER
const KEY = readFileSync(process.env.ASC_KEY_PATH, 'utf8')
const APP = process.env.ASC_APP_ID
const NUMERO = String(process.env.NUMERO)
const ATTESA_MIN = Number(process.env.ATTESA_MIN || 45)

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
function gettone () {
  const now = Math.floor(Date.now() / 1000)
  const testa = b64({ alg: 'ES256', kid: KID, typ: 'JWT' })
  const corpo = b64({ iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })
  const s = createSign('SHA256'); s.update(`${testa}.${corpo}`); s.end()
  return `${testa}.${corpo}.${s.sign({ key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}
async function asc (via, { metodo = 'GET', corpo = null } = {}) {
  let ultimo
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`https://api.appstoreconnect.apple.com/v1${via}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${gettone()}`, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined
      })
      const t = await r.text()
      let j; try { j = JSON.parse(t) } catch { j = t }
      if (!r.ok) throw new Error(`${r.status} ${via} ${JSON.stringify(j)}`)
      return j
    } catch (e) {
      ultimo = e
      if (!/fetch failed|ETIMEDOUT|ECONNRESET|socket/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 3000 * (i + 1)))
    }
  }
  throw ultimo
}

const dormi = ms => new Promise(r => setTimeout(r, ms))

const gruppi = await asc(`/betaGroups?filter[app]=${APP}&limit=10`)
const gruppo = gruppi.data[0]
if (!gruppo) { console.log('::error::nessun gruppo TestFlight per questa app'); process.exit(1) }

const tester = await asc(`/betaGroups/${gruppo.id}/betaTesters?limit=50`)
console.log(`gruppo "${gruppo.attributes.name}": ${tester.data.length} tester`)
if (tester.data.length === 0) {
  // 🔴 gruppo vuoto = nessun invito, e nessuna schermata lo dice
  console.log('::warning::il gruppo non ha tester dentro, nessuno ricevera invito')
}

// 🔴 /builds?filter[app]= mostra SOLO le build gia' VALID: una in lavorazione
// li' non compare, e sembra persa. L'unico posto dove si vede subito e'
// /preReleaseVersions?include=builds. La differenza conta: "PROCESSING" vuol
// dire aspetta, "non compare affatto" vuol dire che Apple l'ha SCARTATA e
// arrivera' solo un'email.
async function cercaBuild () {
  const v = await asc(`/preReleaseVersions?filter[app]=${APP}&include=builds&limit=10`)
  return (v.included || []).find(x => x.attributes.version === NUMERO) || null
}

let build = null
let vistaAlmenoUnaVolta = false
for (let i = 0; i < ATTESA_MIN * 2; i++) {
  const b = await cercaBuild()
  if (b) {
    vistaAlmenoUnaVolta = true
    if (b.attributes.processingState === 'VALID') { build = b; break }
    if (b.attributes.processingState === 'INVALID' || b.attributes.processingState === 'FAILED') {
      console.log(`::error::Apple ha scartato la build ${NUMERO}: ${b.attributes.processingState}`)
      process.exit(1)
    }
  }
  const ora = new Date().toISOString().slice(11, 16)
  console.log(`  ${ora} build ${NUMERO}: ${b ? b.attributes.processingState : 'non ancora comparsa'}`)
  await dormi(30000)
}
if (!build) {
  if (!vistaAlmenoUnaVolta) {
    console.log(`::error::dopo ${ATTESA_MIN} minuti la build ${NUMERO} non e' MAI comparsa: probabilmente Apple l'ha scartata, controllare l'email (\"Please correct the following issues\")`)
  } else {
    console.log(`::error::la build ${NUMERO} e' rimasta in lavorazione oltre ${ATTESA_MIN} minuti`)
  }
  process.exit(1)
}

await asc(`/betaGroups/${gruppo.id}/relationships/builds`, {
  metodo: 'POST', corpo: { data: [{ type: 'builds', id: build.id }] }
})
const d = await asc(`/builds/${build.id}/buildBetaDetail`)
console.log(`build ${NUMERO} assegnata. Stato: ${d.data.attributes.internalBuildState}`)
if (d.data.attributes.internalBuildState !== 'IN_BETA_TESTING') {
  console.log('::warning::lo stato non e IN_BETA_TESTING: controllare i tester del gruppo')
}
