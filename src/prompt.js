import fs from 'node:fs';

const promptBase = fs.readFileSync(
  new URL('../prompts/asesor-comercial.md', import.meta.url),
  'utf8',
).trim();

export function obtenerPromptSistema() {
  const instruccionesAdicionales = process.env.GEMINI_SYSTEM_PROMPT?.trim();
  return instruccionesAdicionales
    ? `# Instrucciones adicionales\n\n${instruccionesAdicionales}\n\n${promptBase}`
    : promptBase;
}
