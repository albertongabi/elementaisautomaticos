import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fortniteking.com';
const CATALOG_PATH = new URL('../elementais.json', import.meta.url);
const VARIANT_ALIASES = {
  Normal: ['Normal'],
  Dourado: ['Dourado'],
  Gelatinoso: ['Gelatinoso'],
  Galáctico: ['Galáctico', 'Galactico'],
  Metalizado: ['Metalizado'],
  'Cúbico': ['Cúbico', 'Cubico', 'Cubo'],
  Quack: ['Quack'],
  Gema: ['Gema']
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'MeusElementaisBot/1.0 (+GitHub Actions; catálogo pessoal)',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function extractDropFromCandidate($, candidate, aliases) {
  let node = candidate;
  for (let depth = 0; depth < 5 && node?.length; depth += 1) {
    const text = normalize(node.text());
    if (text.length < 1800 && /\bDrop\b/i.test(text)) {
      const match = text.match(/\bDrop\s*(Em breve|[0-9]+(?:[.,][0-9]+)?\s*%)/i);
      if (match) return normalize(match[1]);
    }
    node = node.parent();
  }
  return null;
}

function parseVariantDrop($, variant) {
  const aliases = VARIANT_ALIASES[variant] || [variant];
  let found = null;

  $('h2,h3,h4,h5,strong,b,p,span,div').each((_, el) => {
    if (found) return;
    const text = normalize($(el).clone().children().remove().end().text());
    if (aliases.some(alias => text.toLocaleLowerCase('pt-BR') === alias.toLocaleLowerCase('pt-BR'))) {
      found = extractDropFromCandidate($, $(el), aliases);
    }
  });
  if (found) return found;

  const pageText = normalize($('main').text() || $('body').text());
  for (const alias of aliases) {
    const nextNames = Object.values(VARIANT_ALIASES).flat().filter(x => x !== alias).map(escapeRe).join('|');
    const regex = new RegExp(`(?:^|\\s)${escapeRe(alias)}\\s+([\\s\\S]{0,900}?\\bDrop\\s*(Em breve|[0-9]+(?:[.,][0-9]+)?\\s*%))(?=\\s(?:${nextNames})\\s|$)`, 'i');
    const match = pageText.match(regex);
    if (match) return normalize(match[2]);
  }
  return null;
}

function parseRarity($, fallback) {
  const text = normalize($('main').text() || $('body').text());
  const match = text.match(/\bRaridade\s+(Comum|Incomum|Raro|Épico|Epico|Lendário|Lendario|Mítico|Mitico)\b/i);
  if (!match) return fallback;
  return match[1]
    .replace(/^Epico$/i, 'Épico')
    .replace(/^Lendario$/i, 'Lendário')
    .replace(/^Mitico$/i, 'Mítico');
}

async function updateType(type) {
  const url = `${BASE_URL}/sprite/${type.slug}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const next = structuredClone(type);
  next.raridade = parseRarity($, type.raridade);

  let parsed = 0;
  for (const variant of type.variantesDisponiveis) {
    const drop = parseVariantDrop($, variant);
    if (!drop) {
      console.warn(`AVISO: não encontrei Drop de ${type.nome} / ${variant}; mantendo valor anterior.`);
      continue;
    }
    parsed += 1;
    next.variantes[variant] = {
      ...(next.variantes[variant] || {}),
      status: /^em breve$/i.test(drop) ? 'em_breve' : 'disponivel',
      drop,
      fonte: url
    };
  }
  return { type: next, parsed };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
  let totalParsed = 0;
  const updated = [];

  for (const type of catalog.tipos) {
    try {
      const result = await updateType(type);
      updated.push(result.type);
      totalParsed += result.parsed;
    } catch (error) {
      console.warn(`AVISO: falha ao atualizar ${type.nome}: ${error.message}; mantendo dados anteriores.`);
      updated.push(type);
    }
    await sleep(250);
  }

  // Proteção contra mudanças grandes no HTML do site: não publica um catálogo vazio.
  if (totalParsed < 20) {
    throw new Error(`Extração pouco confiável: apenas ${totalParsed} combinações identificadas.`);
  }

  catalog.tipos = updated;
  catalog.atualizadoEm = new Date().toISOString();
  catalog.fonte = BASE_URL;
  catalog.estatisticas = {
    combinacoesLidas: totalParsed,
    disponiveis: updated.reduce((n,t) => n + Object.values(t.variantes).filter(v => v.status === 'disponivel').length, 0),
    emBreve: updated.reduce((n,t) => n + Object.values(t.variantes).filter(v => v.status === 'em_breve').length, 0)
  };

  await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Catálogo atualizado: ${totalParsed} combinações lidas.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
