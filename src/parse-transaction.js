import * as api from '@actual-app/api';

export function parseDdMmYy(s) {
  const parts = String(s).trim().split(/[-/]/);
  if (parts.length !== 3) throw new Error(`Bad txnDate (expected DD-MM-YY): ${s}`);
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  let y = Number(parts[2]);
  if (y < 100) y += 2000;
  if (!d || !m || !y) throw new Error(`Bad txnDate: ${s}`);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function signedIntegerAmount(amount, type) {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${amount}`);
  const cents = api.utils.amountToInteger(Math.abs(n));
  if (type === 'debit') return -cents;
  if (type === 'credit') return cents;
  throw new Error(`type must be debit or credit, got: ${type}`);
}
