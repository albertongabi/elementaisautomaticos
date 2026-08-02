# Meus Elementais — versão 2 para GitHub + Netlify

Este projeto mantém a interface separada em HTML, CSS, JavaScript e JSON. O progresso de cada pessoa continua salvo no navegador (`localStorage`).

## Estrutura

```text
index.html
assets/
  styles.css
  app.js
elementais.json
scripts/
  atualizar-elementais.js
  validar-catalogo.js
.github/
  workflows/
    atualizar-elementais.yml
package.json
netlify.toml
```

## Subir no GitHub

Envie todo o conteúdo desta pasta para a raiz do repositório, preservando as pastas. O arquivo do workflow precisa ficar exatamente em `.github/workflows/atualizar-elementais.yml`.

Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.

Depois abra **Actions → Atualizar catálogo de elementais → Run workflow**.

## Conectar ao Netlify

1. No Netlify, abra o site atual.
2. Vá a **Site configuration → Build & deploy → Continuous deployment**.
3. Em **Repository**, escolha **Link repository** ou **Connect to Git provider**.
4. Selecione GitHub e o repositório `elementais`.
5. Branch de produção: `main`.
6. Build command: deixe vazio.
7. Publish directory: `.`
8. Salve e faça o primeiro deploy.

Quando a Action alterar `elementais.json` e fizer commit, o Netlify detectará o commit e publicará novamente o site.

## Atualização automática

O workflow roda diariamente às 12:17 UTC (aproximadamente 09:17 em Brasília) e também pode ser executado manualmente. Ele consulta as páginas dos tipos no FortniteKing, atualiza os status `disponivel`/`em_breve`, valida o resultado e só faz commit se o JSON mudou.

## Segurança contra falhas

Se a estrutura do FortniteKing mudar e o script reconhecer poucas combinações, a execução falha antes de substituir o catálogo. Mesmo quando o JSON não carregar, a página mantém um catálogo interno de fallback.
