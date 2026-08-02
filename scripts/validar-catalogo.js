import fs from 'node:fs/promises';
const file = new URL('../elementais.json', import.meta.url);
const data = JSON.parse(await fs.readFile(file, 'utf8'));
if (!Array.isArray(data.tipos) || !data.tipos.length) throw new Error('Catálogo sem tipos.');
for (const t of data.tipos) {
  if (!t.nome || !t.slug || !Array.isArray(t.variantesDisponiveis)) throw new Error(`Tipo inválido: ${JSON.stringify(t)}`);
  for (const v of t.variantesDisponiveis) {
    const status = t.variantes?.[v]?.status;
    if (!['disponivel','em_breve'].includes(status)) throw new Error(`${t.nome}/${v}: status inválido`);
  }
}
console.log(`Catálogo válido: ${data.tipos.length} tipos.`);
