# Recato private chat

Open-source code of Recato's private chat: what you write is encrypted on your device and only read inside a verified secure enclave. This repository holds that code and the fingerprints of every release, so anyone can check that the Recato app, the browser extension and privada.recato.ai run exactly this code.

[Português abaixo](#conversa-privada-do-recato)

## How it works

- The private chat screen encrypts each message on your device and sends it, through Recato's server, to a secure enclave run by [Privatemode](https://www.privatemode.ai) — only after checking the enclave's attestation. Recato's server only passes encrypted bytes along.
- Saved chats are encrypted with a key that never leaves your device in readable form. On a new device they open only with your recovery code, which Recato does not have.
- The same files run in three places: inside the Android app, inside the browser extension «Recato — Conversa privada», and on privada.recato.ai. Only the last one is served by Recato on every visit, so it is the one to check.

## How to check

1. **Android app** — the screen comes inside the app (`assets/privada/`) and only changes with a new store release; its files have the fingerprints in `manifestos.json`.
2. **Browser extension** (Chrome, Edge, Firefox) — the private chat opens from the copy inside the extension. When you open privada.recato.ai, the extension compares what your browser received with these fingerprints: green if it is a published version, a red warning covering the page if it is not.
3. **By hand** — download a file and compare its SHA-256 fingerprint with `manifestos.json`:

   ```
   curl -s https://privada.recato.ai/privada.js | shasum -a 256
   ```

   The page (`index.html`) pins `privada.js` and `estilo.css` (the browser refuses others) and `privada.js` pins the enclave module (`privatemode.wasm`).

## Repeat the build

With Node.js 20 or later:

```
cd codigo
npm ci --ignore-scripts
npm run privada -- --publicacao=producao
cat dist/manifesto.json
```

You get exactly the fingerprints published in `manifestos.json` for that version.

## What is here

- `manifestos.json` — every published version, with the SHA-256 fingerprint of each file: the web page, the extension for Chrome/Edge and for Firefox, and the app's screen. A published version never changes.
- `versoes/<version>.json` — the same, one file per version.
- `codigo/` — the code: `privada/` (the screen), `extensao/` (the extension) and `scripts/` (build, publication and tests). The code and its comments are in European Portuguese.

## Licence

MIT — see [LICENSE](LICENSE). Third-party code included in the screen (the Privatemode SDK, Go's `wasm_exec.js`, the OpenAI SDK) keeps its own licences: [`codigo/privada/licencas.txt`](codigo/privada/licencas.txt).

## Security

Found a problem? Please write privately to info@recato.pt.

---

# Conversa privada do Recato

O código aberto da conversa privada do Recato: o que escreves é cifrado no teu dispositivo e só é lido dentro de uma caixa-forte verificada. Este repositório tem esse código e as impressões digitais de cada versão, para qualquer pessoa confirmar que a app do Recato, a extensão do browser e privada.recato.ai correm exatamente este código.

## Como funciona

- O ecrã da conversa privada cifra cada mensagem no teu dispositivo e envia-a, pelo servidor do Recato, para uma caixa-forte da [Privatemode](https://www.privatemode.ai) — só depois de verificar a prova (atestação) da caixa-forte. O servidor do Recato só passa bytes cifrados.
- As conversas guardadas ficam cifradas com uma chave que nunca sai legível do teu dispositivo. Num dispositivo novo, só abrem com o teu código de recuperação, que o Recato não tem.
- Os mesmos ficheiros correm em três sítios: dentro da app Android, dentro da extensão «Recato — Conversa privada» e em privada.recato.ai. Só este último é enviado pelo Recato em cada visita: é esse que convém confirmar.

## Como confirmar

1. **App Android** — o ecrã vem dentro da app (`assets/privada/`) e só muda com uma versão nova na loja; os ficheiros têm as impressões digitais do `manifestos.json`.
2. **Extensão do browser** (Chrome, Edge, Firefox) — a conversa privada abre a partir da cópia que vem dentro da extensão. Ao abrires privada.recato.ai, a extensão compara o que o teu browser recebeu com estas impressões digitais: verde se é uma versão publicada, um aviso vermelho a tapar a página se não for.
3. **À mão** — descarrega um ficheiro e compara a impressão digital SHA-256 com o `manifestos.json`:

   ```
   curl -s https://privada.recato.ai/privada.js | shasum -a 256
   ```

   A página (`index.html`) prende o `privada.js` e o `estilo.css` (o browser recusa outros) e o `privada.js` prende o módulo da caixa-forte (`privatemode.wasm`).

## Repetir a compilação

Com o Node.js 20 ou mais recente:

```
cd codigo
npm ci --ignore-scripts
npm run privada -- --publicacao=producao
cat dist/manifesto.json
```

Obténs exatamente as impressões digitais publicadas no `manifestos.json` para essa versão.

## O que está aqui

- `manifestos.json` — todas as versões publicadas, com a impressão digital SHA-256 de cada ficheiro: a página web, a extensão para Chrome/Edge e para Firefox, e o ecrã da app. Uma versão publicada nunca muda.
- `versoes/<versão>.json` — o mesmo, um ficheiro por versão.
- `codigo/` — o código: `privada/` (o ecrã), `extensao/` (a extensão) e `scripts/` (compilação, publicação e testes).

## Licença

MIT — ver [LICENSE](LICENSE). O código de terceiros que vai no ecrã (o SDK da Privatemode, o `wasm_exec.js` do Go, o SDK da OpenAI) mantém as suas licenças: [`codigo/privada/licencas.txt`](codigo/privada/licencas.txt).

## Segurança

Encontraste um problema? Escreve-nos em privado para info@recato.pt.
