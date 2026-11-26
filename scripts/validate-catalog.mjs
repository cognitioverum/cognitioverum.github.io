import { readFileSync, existsSync } from 'node:fs';

const books = JSON.parse(readFileSync(new URL('../data/books.json', import.meta.url), 'utf8'));
if (!Array.isArray(books)) throw Error('books.json must contain an array');
const ids = new Set();
for (const book of books) {
  if (!book.id || ids.has(book.id)) throw Error(`duplicate or missing ID: ${book.id}`);
  ids.add(book.id);
  if (typeof book.author !== 'string' || !book.author.trim() || typeof book.title !== 'string' || !book.title.trim()) throw Error(`missing author/title: ${book.id}`);
  if (!Number.isFinite(book.price) || book.price < 0) throw Error(`invalid price: ${book.id}`);
  if (!Number.isInteger(book.quantity) || book.quantity < 0) throw Error(`invalid quantity: ${book.id}`);
  if (book.status !== (book.quantity > 0 ? 'available' : 'sold')) throw Error(`status/quantity mismatch: ${book.id}`);
  if (book.image != null && (!/^assets\/images\/books\/[\w.-]+\.(webp|png|jpe?g)$/i.test(book.image) || !existsSync(new URL(`../${book.image}`, import.meta.url)))) throw Error(`missing or unsafe image: ${book.id}`);
}
console.log(`valid: ${books.length} records, ${books.filter(book => book.quantity > 0).length} available positions, ${books.reduce((sum, book) => sum + book.quantity, 0)} copies`);
