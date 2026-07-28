// Parser tolerante para listas de convocação coladas cruas do WhatsApp — ver App.tsx (etapa 'preview').
// Regras completas na conversa que originou esse arquivo; resumo:
//  1) prioridade pro número entre asteriscos no texto ORIGINAL (ex: *17*) — sinal mais confiável
//  2) senão, o último inteiro isolado da linha, ignorando a numeração ordinal do início,
//     números decimais (vírgula/ponto), precedidos de "R$" ou seguidos de "créd"/"crédito"/"reais"
//  3) nome = texto entre o fim da numeração ordinal e o início do código (não "o que sobra"
//     depois de remover o código de qualquer lugar — evita capturar nota de pagamento junto do nome)
//  4) a partir de um cabeçalho "Goleiro(s)", para de processar (goleiros não entram na convocação)
//  5) linhas vazias, cabeçalhos/avisos conhecidos, e qualquer linha sem código válido viram "descartada"

export interface ParsedConvocationLine {
  id: string;
  name: string;
  code: string;
}

export interface ParseConvocationResult {
  lines: ParsedConvocationLine[];
  discardedLines: string[];
}

const GOALKEEPER_HEADER = /goleiros?\b/i;

const DISCARD_KEYWORDS: RegExp[] = [
  /rela[cç][aã]o de pagantes/i,
  /pelada de hoje/i,
  /time campe[aã]o confirmado/i,
  /\bobs\b\s*:/i,
  /\bpix\b/i,
  /\bbanco\b/i,
  /dados\s*p?\/?\s*pagamento/i,
  /\bvalor\b\s*:/i,
];

// Mesmas faixas de emoji já usadas em App.tsx#cleanNames, pra manter consistência.
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

const ORDINAL_PREFIX = /^\s*\d+\s*[-.):]?\s*/;
const CURRENCY_SUFFIX = /^(cr[eé]d(?:ito)?|reais)/i;
const CURRENCY_PREFIX = /r\$$/i;

const stripMarkdown = (s: string) => s.replace(/[*_~]/g, '');

const normalizeLine = (s: string) =>
  stripMarkdown(s).replace(EMOJI_REGEX, '').replace(/\s+/g, ' ').trim();

interface Token {
  token: string;
  start: number;
}

const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ token: m[0], start: m.index });
  }
  return tokens;
};

// Entre os candidatos que são inteiros "puros" (sem vírgula/ponto/R$ grudado, o que já os
// desqualifica do regex \d+), ainda filtra quem tem contexto de valor monetário ao redor
// (precedido de "R$" isolado, ou seguido de "créd"/"crédito"/"reais") e pega o último válido.
const findLastValidCodeToken = (tokens: Token[]): Token | null => {
  let lastValid: Token | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const { token } = tokens[i];
    if (!/^\d+$/.test(token)) continue;
    const prev = tokens[i - 1]?.token ?? '';
    const next = tokens[i + 1]?.token ?? '';
    if (CURRENCY_PREFIX.test(prev)) continue;
    if (CURRENCY_SUFFIX.test(next)) continue;
    lastValid = tokens[i];
  }
  return lastValid;
};

export const parseConvocationList = (rawText: string): ParseConvocationResult => {
  const lines: ParsedConvocationLine[] = [];
  const discardedLines: string[] = [];
  let inGoalkeeperSection = false;
  let counter = 0;

  for (const originalLine of rawText.split('\n')) {
    const trimmedOriginal = originalLine.trim();
    if (trimmedOriginal.length === 0) continue;

    if (inGoalkeeperSection) {
      discardedLines.push(trimmedOriginal);
      continue;
    }

    if (GOALKEEPER_HEADER.test(trimmedOriginal)) {
      inGoalkeeperSection = true;
      discardedLines.push(trimmedOriginal);
      continue;
    }

    if (DISCARD_KEYWORDS.some(re => re.test(trimmedOriginal))) {
      discardedLines.push(trimmedOriginal);
      continue;
    }

    const cleaned = normalizeLine(trimmedOriginal).replace(ORDINAL_PREFIX, '').trim();
    const tokens = tokenize(cleaned);

    // 1) prioridade: número entre asteriscos no texto ORIGINAL
    const asteriskMatch = trimmedOriginal.match(/\*(\d+)\*/);
    let codeToken: Token | null = null;

    if (asteriskMatch) {
      codeToken = tokens.find(t => t.token === asteriskMatch[1]) ?? null;
    }

    // 2) fallback: último inteiro isolado válido (também usado se o número do asterisco,
    // por algum motivo, não aparecer isolado no texto limpo)
    if (!codeToken) {
      codeToken = findLastValidCodeToken(tokens);
    }

    if (!codeToken) {
      discardedLines.push(trimmedOriginal);
      continue;
    }

    const name = cleaned.slice(0, codeToken.start).replace(/[-\s]+$/, '').trim();

    if (!name) {
      discardedLines.push(trimmedOriginal);
      continue;
    }

    counter++;
    lines.push({ id: `parsed-${counter}`, name, code: codeToken.token });
  }

  return { lines, discardedLines };
};
