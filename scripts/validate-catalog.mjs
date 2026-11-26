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
  if (book.image != null) {
    if (!/^assets\/images\/books\/[\w.-]+\.(webp|png|jpe?g)$/i.test(book.image)) throw Error(`unsafe image path: ${book.id}`);
    const imageUrl = new URL(`../${book.image}`, import.meta.url);
    if (!existsSync(imageUrl)) throw Error(`missing image: ${book.id}`);
    if (book.image.toLowerCase().endsWith('.png')) {
      if (book.image !== `assets/images/books/${book.id}.png`) throw Error(`PNG filename must match book ID: ${book.id}`);
      const header = readFileSync(imageUrl).subarray(0, 24);
      if (header.length < 24 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          header.toString('ascii', 12, 16) !== 'IHDR' || header.readUInt32BE(16) !== 288 || header.readUInt32BE(20) !== 385)
        throw Error(`invalid PNG dimensions (expected 288 × 385): ${book.id}`);
    }
  }
}
console.log(`valid: ${books.length} records, ${books.filter(book => book.quantity > 0).length} available positions, ${books.reduce((sum, book) => sum + book.quantity, 0)} copies`);
