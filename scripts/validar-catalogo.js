import fs from 'node:fs/promises';

const CATALOG_PATH = new URL('../elementais.json', import.meta.url);
const VALID_STATUSES = new Set(['disponivel', 'em_breve']);

const data = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));

if (!Array.isArray(data.tipos) || data.tipos.length === 0) {
  throw new Error('Catálogo sem tipos.');
}

const names = new Set();
const slugs = new Set();
let combinations = 0;
let available = 0;
let comingSoon = 0;

for (const type of data.tipos) {
  if (!type || typeof type !== 'object') {
    throw new Error(`Tipo inválido: ${JSON.stringify(type)}`);
  }

  if (!type.nome || !type.slug || !type.raridade) {
    throw new Error(`Tipo sem nome, slug ou raridade: ${JSON.stringify(type)}`);
  }

  if (names.has(type.nome)) throw new Error(`Nome duplicado: ${type.nome}`);
  if (slugs.has(type.slug)) throw new Error(`Slug duplicado: ${type.slug}`);
  names.add(type.nome);
  slugs.add(type.slug);

  if (!Array.isArray(type.variantesDisponiveis) || type.variantesDisponiveis.length === 0) {
    throw new Error(`${type.nome}: variantesDisponiveis inválido.`);
  }

  const variantNames = new Set();

  for (const variantName of type.variantesDisponiveis) {
    if (variantNames.has(variantName)) {
      throw new Error(`${type.nome}: variante duplicada ${variantName}.`);
    }
    variantNames.add(variantName);

    const variant = type.variantes?.[variantName];
    if (!variant || !VALID_STATUSES.has(variant.status)) {
      throw new Error(`${type.nome}/${variantName}: status inválido ou ausente.`);
    }

    if (variant.fonte && !String(variant.fonte).startsWith('https://www.fortniteking.com/')) {
      throw new Error(`${type.nome}/${variantName}: fonte inesperada.`);
    }

    combinations += 1;
    if (variant.status === 'disponivel') available += 1;
    if (variant.status === 'em_breve') comingSoon += 1;
  }
}

if (combinations < 20) {
  throw new Error(`Catálogo pequeno demais: ${combinations} combinações.`);
}

console.log(
  `Catálogo válido: ${data.tipos.length} tipos, ${combinations} combinações, ` +
  `${available} disponíveis e ${comingSoon} em breve.`
);
