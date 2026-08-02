import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fortniteking.com';
const CATALOG_PATH = new URL('../elementais.json', import.meta.url);
const REQUEST_DELAY_MS = 300;

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
const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeKey = value => normalize(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'MeusElementaisBot/1.0 (GitHub Actions; catálogo pessoal)',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao acessar ${url}`);
  }

  return response.text();
}

function pageText($) {
  return normalize($('main').text() || $('body').text());
}

function parseRarity($, fallback) {
  const match = pageText($).match(
    /\bRaridade\s+(Comum|Incomum|Raro|Épico|Epico|Lendário|Lendario|Mítico|Mitico)\b/i
  );

  if (!match) return fallback;

  return match[1]
    .replace(/^Epico$/i, 'Épico')
    .replace(/^Lendario$/i, 'Lendário')
    .replace(/^Mitico$/i, 'Mítico');
}

function parseVariantCount($, fallback) {
  const match = pageText($).match(/\bVariantes?\s+(\d+)\b/i);
  return match ? Number(match[1]) : fallback;
}

function findDropNearElement($, element) {
  let node = $(element);

  for (let depth = 0; depth < 6 && node.length; depth += 1) {
    const text = normalize(node.text());

    if (text.length <= 2200 && /\bDrop\b/i.test(text)) {
      const match = text.match(/\bDrop\s*(Em breve|[0-9]+(?:[.,][0-9]+)?\s*%)/i);
      if (match) return normalize(match[1]);
    }

    node = node.parent();
  }

  return null;
}

function parseVariantDrop($, variantName) {
  const aliases = VARIANT_ALIASES[variantName] ?? [variantName];
  const aliasKeys = new Set(aliases.map(normalizeKey));
  let result = null;

  $('h1,h2,h3,h4,h5,h6,strong,b,p,span,div').each((_, element) => {
    if (result) return false;

    const ownText = normalize(
      $(element).clone().children().remove().end().text()
    );

    if (aliasKeys.has(normalizeKey(ownText))) {
      result = findDropNearElement($, element);
      if (result) return false;
    }

    return undefined;
  });

  if (result) return result;

  // Fallback para páginas server-rendered nas quais os blocos não possuem
  // classes estáveis. Procura o nome da variante e o Drop antes da próxima.
  const text = pageText($);
  const allAliases = Object.values(VARIANT_ALIASES).flat();

  for (const alias of aliases) {
    const nextVariantPattern = allAliases
      .filter(item => normalizeKey(item) !== normalizeKey(alias))
      .map(escapeRegExp)
      .join('|');

    const pattern = new RegExp(
      `(?:^|\\s)${escapeRegExp(alias)}\\s+([\\s\\S]{0,1200}?)\\bDrop\\s*(Em breve|[0-9]+(?:[.,][0-9]+)?\\s*%)(?=\\s(?:${nextVariantPattern})\\s|$)`,
      'i'
    );

    const match = text.match(pattern);
    if (match) return normalize(match[2]);
  }

  return null;
}

function statusFromDrop(drop) {
  return /^em breve$/i.test(normalize(drop)) ? 'em_breve' : 'disponivel';
}

async function updateType(type) {
  const url = `${BASE_URL}/sprite/${type.slug}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const next = structuredClone(type);

  next.raridade = parseRarity($, type.raridade);

  const advertisedVariantCount = parseVariantCount(
    $,
    Array.isArray(type.variantesDisponiveis) ? type.variantesDisponiveis.length : 0
  );

  let parsedCount = 0;
  const availableVariants = Array.isArray(type.variantesDisponiveis)
    ? type.variantesDisponiveis
    : [];

  for (const variant of availableVariants) {
    const drop = parseVariantDrop($, variant);

    if (!drop) {
      console.warn(`AVISO: Drop não encontrado para ${type.nome} / ${variant}; valor anterior mantido.`);
      continue;
    }

    parsedCount += 1;
    next.variantes ??= {};
    next.variantes[variant] = {
      ...(next.variantes[variant] ?? {}),
      status: statusFromDrop(drop),
      drop,
      fonte: url
    };
  }

  if (advertisedVariantCount !== availableVariants.length) {
    console.warn(
      `ATENÇÃO: ${type.nome} anuncia ${advertisedVariantCount} variante(s), ` +
      `mas o catálogo local possui ${availableVariants.length}. Revise quando conveniente.`
    );
  }

  return { next, parsedCount };
}

function catalogCore(catalog) {
  return catalog.tipos.map(type => ({
    nome: type.nome,
    slug: type.slug,
    raridade: type.raridade,
    variantesDisponiveis: type.variantesDisponiveis,
    variantes: type.variantes
  }));
}

async function main() {
  const originalText = await fs.readFile(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(originalText);

  if (!Array.isArray(catalog.tipos) || catalog.tipos.length === 0) {
    throw new Error('elementais.json não possui tipos para atualizar.');
  }

  const previousCore = JSON.stringify(catalogCore(catalog));
  const updatedTypes = [];
  let totalParsed = 0;
  let pagesFailed = 0;

  for (const type of catalog.tipos) {
    try {
      const { next, parsedCount } = await updateType(type);
      updatedTypes.push(next);
      totalParsed += parsedCount;
      console.log(`${type.nome}: ${parsedCount}/${type.variantesDisponiveis.length} variantes lidas.`);
    } catch (error) {
      pagesFailed += 1;
      updatedTypes.push(type);
      console.warn(`AVISO: ${type.nome} não foi atualizado: ${error.message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const expectedCombinations = catalog.tipos.reduce(
    (sum, type) => sum + (type.variantesDisponiveis?.length ?? 0),
    0
  );
  const minimumReliable = Math.max(20, Math.floor(expectedCombinations * 0.7));

  if (totalParsed < minimumReliable) {
    throw new Error(
      `Extração considerada insegura: ${totalParsed}/${expectedCombinations} combinações lidas. ` +
      'O arquivo foi preservado sem alterações.'
    );
  }

  if (pagesFailed > Math.max(2, Math.floor(catalog.tipos.length * 0.2))) {
    throw new Error(
      `Muitas páginas falharam (${pagesFailed}/${catalog.tipos.length}). ` +
      'O arquivo foi preservado sem alterações.'
    );
  }

  catalog.tipos = updatedTypes;
  const newCore = JSON.stringify(catalogCore(catalog));

  if (newCore === previousCore) {
    console.log('Nenhuma mudança de disponibilidade, drop ou raridade foi encontrada.');
    return;
  }

  catalog.atualizadoEm = new Date().toISOString();
  catalog.fonte = `${BASE_URL}/sprite`;
  catalog.estatisticas = {
    combinacoesLidas: totalParsed,
    disponiveis: updatedTypes.reduce(
      (sum, type) => sum + Object.values(type.variantes ?? {})
        .filter(variant => variant.status === 'disponivel').length,
      0
    ),
    emBreve: updatedTypes.reduce(
      (sum, type) => sum + Object.values(type.variantes ?? {})
        .filter(variant => variant.status === 'em_breve').length,
      0
    )
  };

  await fs.writeFile(
    CATALOG_PATH,
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8'
  );

  console.log(`Catálogo atualizado com ${totalParsed} combinações lidas.`);
}

main().catch(error => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
});
