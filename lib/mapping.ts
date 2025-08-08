import dayjs from 'dayjs';

export type ColumnType = 'date' | 'number' | 'string' | 'boolean';

export interface HeaderIndex {
  headers: string[];
  normalizedHeaders: string[];
  headerToIndex: Record<string, number>;
  synonyms: Record<string, string[]>; // canonical header -> synonyms
}

export interface MappingSuggestion {
  incomingKey: string;
  targetHeader: string | null;
  confidence: number; // 0..1
  reasons: string[];
}

const DEFAULT_SYNONYMS: Record<string, string[]> = {
  'reg#': ['reg', 'registration', 'vehicle reg', 'plate', 'license', 'licence', 'vehicle number'],
  'vehicle': ['car', 'truck', 'van', 'vehicle name', 'vehicle id'],
  'driver': ['operator', 'driver name', 'person'],
  'date': ['timestamp', 'time', 'day'],
  'km start': ['km start', 'start km', 'odometer start', 'odo start', 'km at start'],
  'km end': ['km end', 'end km', 'odometer end', 'odo end', 'km at end'],
  'total km': ['distance', 'kms', 'km total', 'total kms'],
  'business km': ['business kms', 'work km', 'work kms'],
  'prvt km': ['private km', 'private kms', 'personal km', 'prvt kms'],
  'fuel in liters': ['fuel in litres', 'liters', 'litres', 'fuel liters', 'fuel litres', 'fuel qty', 'qty', 'quantity'],
  'fuel cost in rands': ['fuel cost', 'cost', 'amount', 'price', 'rands', 'zar', 'total cost', 'total incl', 'total including', 'total inc', 'incl total'],
  'town visited': ['town', 'city', 'location', 'destination'],
  'sales made': ['sales', 'revenue', 'total sales'],
  // Financial/receipt sheets
  'item': ['details of visit', 'details', 'visit', 'merchant', 'vendor', 'shop', 'restaurant', 'place', 'description', 'item name'],
  'category': ['type', 'group', 'class'],
  'ex vat': ['ex vat', 'exclusive', 'excl', 'net', 'subtotal', 'before vat'],
  'vat': ['vat', 'tax', 'value added tax', 'v.a.t'],
  'total incl': ['total including', 'incl total', 'grand total', 'amount', 'total', 'fuel cost in rands']
};

function normalizeToken(text: string): string {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalizeToken(text).split(' ').filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const intersection = new Set([...A].filter(x => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return intersection / union;
}

export function buildHeaderIndex(headers: string[], customSynonyms?: Record<string, string[]>): HeaderIndex {
  const normalizedHeaders = headers.map(h => normalizeToken(h));
  const headerToIndex: Record<string, number> = {};
  normalizedHeaders.forEach((h, i) => { headerToIndex[h] = i; });
  const synonyms = { ...(customSynonyms || {}), ...DEFAULT_SYNONYMS };
  return { headers, normalizedHeaders, headerToIndex, synonyms };
}

export function suggestHeaderMapping(incomingKeys: string[], headers: string[], customSynonyms?: Record<string, string[]>): MappingSuggestion[] {
  const index = buildHeaderIndex(headers, customSynonyms);
  const suggestions: MappingSuggestion[] = [];
  for (const rawKey of incomingKeys) {
    const key = normalizeToken(rawKey);
    let best: { header: string | null; score: number; reasons: string[] } = { header: null, score: 0, reasons: [] };

    index.normalizedHeaders.forEach((hNorm, i) => {
      let score = 0;
      const reasons: string[] = [];

      if (key === hNorm) { score += 1.0; reasons.push('exact match'); }
      const jac = jaccardSimilarity(tokenize(key), tokenize(hNorm));
      if (jac > 0) { score += 0.5 * jac; if (jac >= 0.6) reasons.push(`token overlap ${jac.toFixed(2)}`); }

      // synonym boost
      const canonical = index.headers[i];
      const canonNorm = hNorm;
      const syns = index.synonyms[canonNorm] || index.synonyms[canonical.toLowerCase()] || [];
      if (syns.length > 0) {
        const hit = syns.some(s => normalizeToken(s) === key || key.includes(normalizeToken(s)) || normalizeToken(s).includes(key));
        if (hit) { score += 0.6; reasons.push('synonym match'); }
      }

      if (score > best.score) best = { header: index.headers[i], score, reasons };
    });

    const confidence = Math.min(1, Math.max(0, best.score));
    suggestions.push({ incomingKey: rawKey, targetHeader: best.header, confidence, reasons: best.reasons });
  }
  return suggestions;
}

export function inferColumnTypes(headers: string[], rows: string[][]): Record<string, ColumnType> {
  const result: Record<string, ColumnType> = {};
  const width = headers.length;
  for (let c = 0; c < width; c++) {
    const header = headers[c];
    const values = rows.map(r => (r || [])[c]).slice(0, 50).map(v => String(v ?? ''));
    let numCount = 0, dateCount = 0, boolCount = 0, nonEmpty = 0;
    values.forEach(v => {
      const s = v.trim();
      if (!s) return; nonEmpty++;
      if (/^(true|false)$/i.test(s)) boolCount++;
      const n = parseFloat(s.replace(/[ ,Rr$]/g, ''));
      if (!Number.isNaN(n) && /[0-9]/.test(s)) numCount++;
      const d = dayjs(s).isValid() || /\d{2}\/\d{2}\/\d{2,4}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s);
      if (d) dateCount++;
    });
    let type: ColumnType = 'string';
    if (nonEmpty > 0) {
      if (dateCount / nonEmpty > 0.5) type = 'date';
      else if (numCount / nonEmpty > 0.6) type = 'number';
      else if (boolCount / nonEmpty > 0.6) type = 'boolean';
    }
    result[header] = type;
  }
  return result;
}

export function parseDateFlexible(value: string): string | null {
  const s = String(value || '').trim();
  if (!s) return null;
  const iso = dayjs(s);
  if (iso.isValid()) return iso.format('YYYY-MM-DD');
  // Try DD/MM/YY(YY)
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) >= 70 ? '19' : '20') + yyyy;
    const d2 = dayjs(`${yyyy}-${mm}-${dd}`);
    if (d2.isValid()) return d2.format('YYYY-MM-DD');
  }
  return null;
}

export function parseDecimal(value: unknown): number | null {
  const s = String(value ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Simple row identity matcher based on common keys
export function matchRowIdentity(headers: string[], existingRows: string[][], candidate: Record<string, string>): number {
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => (headerIndex[normalizeToken(h)] = i));
  const getIdx = (name: string) => headerIndex[normalizeToken(name)];

  const dateIdx = getIdx('date');
  const regIdx = getIdx('reg#') ?? getIdx('registration') ?? getIdx('vehicle reg');
  const vehicleIdx = getIdx('vehicle');
  const amountIdx = getIdx('fuel cost in rands') ?? getIdx('total incl') ?? getIdx('amount') ?? getIdx('total');

  const candidateDate = candidate['Date'] || candidate['date'] || '';
  const candidateReg = candidate['Reg#'] || candidate['registration'] || candidate['Vehicle Reg'] || '';
  const candidateVehicle = candidate['Vehicle'] || candidate['vehicle'] || '';
  const candidateAmount = candidate['Fuel Cost in Rands'] || (candidate as any)['Total Incl'] || (candidate as any)['total incl'] || candidate['Amount'] || candidate['Total'] || '';

  const candDateKey = parseDateFlexible(candidateDate) || candidateDate;
  const candAmount = parseDecimal(candidateAmount);

  let bestRow = -1;
  let bestScore = 0;
  for (let r = 1; r < existingRows.length; r++) {
    const row = existingRows[r] || [];
    let score = 0;
    if (dateIdx != null && dateIdx >= 0 && candDateKey) {
      const d = parseDateFlexible(String(row[dateIdx] || '')) || String(row[dateIdx] || '');
      if (d && d === candDateKey) score += 1.0;
    }
    if (regIdx != null && regIdx >= 0 && candidateReg) {
      const a = normalizeToken(String(row[regIdx] || ''));
      const b = normalizeToken(candidateReg);
      if (a && b && a === b) score += 1.0;
    } else if (vehicleIdx != null && vehicleIdx >= 0 && candidateVehicle) {
      const a = normalizeToken(String(row[vehicleIdx] || ''));
      const b = normalizeToken(candidateVehicle);
      if (a && b && a === b) score += 0.6;
    }
    if (amountIdx != null && amountIdx >= 0 && candAmount != null) {
      const rowAmount = parseDecimal(row[amountIdx]);
      if (rowAmount != null && Math.abs(rowAmount - candAmount) < 0.01) score += 0.5;
    }
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
  // Require reasonable certainty
  return bestScore >= 1.4 ? bestRow : -1;
}


