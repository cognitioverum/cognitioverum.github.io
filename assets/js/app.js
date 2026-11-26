(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.COGNITIO_CONFIG || {};
  const storageKey = 'cognitioverum:selected:v1';
  const pageSize = 16;
  const collator = new Intl.Collator('ru', { sensitivity: 'base' });
  const money = amount => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₾`;
  let books = [];
  let selected = new Map();
  let visibleLimit = pageSize;
  let activeBook = null;
  let lastFocus = null;
  let activePanel = null;

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) selected = new Map(saved.filter(id => typeof id === 'string').map(id => [id, 1]));
    else if (saved && typeof saved === 'object') selected = new Map(Object.entries(saved).filter(([id, quantity]) => typeof id === 'string' && Number.isInteger(quantity) && quantity > 0));
  } catch (_) { /* хранилище недоступно или повреждено */ }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(selected))); } catch (_) { /* приватный режим */ }
  }
  function available(book) { return book.status === 'available' && Number.isInteger(book.quantity) && book.quantity > 0; }
  function create(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function cover(book) {
    const frame = create('div', 'cover');
    if (typeof book.image === 'string' && /^assets\/images\/books\/[\w.-]+\.(webp|jpe?g|png)$/i.test(book.image)) {
      const image = create('img');
      image.src = book.image;
      image.alt = `обложка книги «${book.title}»`;
      image.loading = 'lazy';
      image.onerror = () => { image.remove(); frame.append(placeholder()); };
      frame.append(image);
    } else frame.append(placeholder());
    return frame;
  }
  function placeholder() {
    const box = create('div', 'cover-placeholder');
    box.append(create('span', 'placeholder-emblem', 'C V'), create('span', 'placeholder-line'), create('span', 'placeholder-copy', 'фотография скоро появится'));
    return box;
  }
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.set(id, 1);
    persist();
    renderSelection();
    renderCatalog();
    if (activeBook?.id === id) updateDetailAction();
  }
  function adjust(id, change) {
    const book = books.find(item => item.id === id);
    if (!book) return;
    const next = Math.min(book.quantity, Math.max(0, (selected.get(id) || 0) + change));
    if (next) selected.set(id, next); else selected.delete(id);
    persist(); renderSelection(); renderCatalog();
    if (activeBook?.id === id) updateDetailAction();
  }
  function renderCard(book) {
    const card = create('article', 'book-card');
    const open = create('button', 'cover-button');
    open.type = 'button'; open.setAttribute('aria-label', `подробнее: ${book.author}, ${book.title}`);
    open.append(cover(book)); open.addEventListener('click', () => showDetail(book));
    const info = create('div', 'card-info');
    const title = create('button', 'card-title', book.title);
    title.type = 'button'; title.addEventListener('click', () => showDetail(book));
    const bottom = create('div', 'card-bottom');
    const add = create('button', 'add-button', selected.has(book.id) ? 'выбрано ✓' : '+ выбрать');
    add.type = 'button'; add.setAttribute('aria-pressed', String(selected.has(book.id)));
    add.setAttribute('aria-label', `${selected.has(book.id) ? 'убрать из выбранных' : 'выбрать'}: ${book.title}`);
    add.addEventListener('click', () => toggle(book.id));
    bottom.append(create('strong', 'card-price', money(book.price)), add);
    info.append(create('p', 'card-author', book.author), title, create('p', 'card-category', book.category || 'жанр не указан'), bottom);
    card.append(open, info);
    return card;
  }
  function results() {
    const query = $('search').value.trim().toLocaleLowerCase('ru');
    const category = $('category').value;
    const sort = $('sort').value;
    const list = books.filter(book => available(book) && (!category || book.category === category) && (!query || `${book.author} ${book.title}`.toLocaleLowerCase('ru').includes(query)));
    if (sort === 'az') list.sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.author, b.author));
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price || collator.compare(a.title, b.title));
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price || collator.compare(a.title, b.title));
    return list;
  }
  function renderCatalog() {
    const list = results();
    $('book-grid').replaceChildren(...list.slice(0, visibleLimit).map(renderCard));
    $('result-count').textContent = `найдено: ${list.length}`;
    $('empty-state').hidden = list.length !== 0 || books.length === 0;
    $('load-more').hidden = list.length <= visibleLimit;
  }
  function selectionBooks() { return books.filter(book => selected.has(book.id) && available(book)); }
  function renderSelection() {
    const items = selectionBooks();
    const copies = items.reduce((sum, book) => sum + selected.get(book.id), 0);
    $('header-count').textContent = String(copies);
    $('selection-quantity').textContent = `${copies} ${copies % 10 === 1 && copies % 100 !== 11 ? 'книга' : copies % 10 >= 2 && copies % 10 <= 4 && (copies % 100 < 12 || copies % 100 > 14) ? 'книги' : 'книг'}`;
    $('selection-total').textContent = money(items.reduce((sum, book) => sum + book.price * selected.get(book.id), 0));
    $('telegram-button').disabled = items.length === 0;
    $('message-fallback').hidden = true;
    if (!items.length) { $('selection-items').replaceChildren(create('p', 'selection-empty', 'пока здесь пусто. добавьте книги из каталога.')); return; }
    $('selection-items').replaceChildren(...items.map(book => {
      const row = create('div', 'selection-row');
      const details = create('div');
      details.append(create('strong', '', book.title), create('p', '', book.author));
      const price = create('span', '', money(book.price * selected.get(book.id)));
      const remove = create('button', 'remove-button', 'убрать');
      remove.type = 'button'; remove.setAttribute('aria-label', `убрать: ${book.title}`);
      remove.addEventListener('click', () => toggle(book.id));
      const controls = create('div', 'quantity-controls');
      const minus = create('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', `уменьшить количество: ${book.title}`);
      minus.addEventListener('click', () => adjust(book.id, -1));
      const plus = create('button', '', '+'); plus.type = 'button'; plus.disabled = selected.get(book.id) >= book.quantity;
      plus.setAttribute('aria-label', `увеличить количество: ${book.title}`); plus.addEventListener('click', () => adjust(book.id, 1));
      controls.append(minus, create('span', '', String(selected.get(book.id))), plus);
      row.append(details, price, controls, remove); return row;
    }));
  }
  function message() {
    const list = selectionBooks();
    return `Здравствуйте! Меня интересуют книги CognitioVerum:\n${list.map((book, i) => `${i + 1}. ${book.author} — ${book.title} × ${selected.get(book.id)} — ${money(book.price * selected.get(book.id))}`).join('\n')}\n\nВсего: ${money(list.reduce((sum, book) => sum + book.price * selected.get(book.id), 0))}.\nПодскажите, пожалуйста, наличие, состояние и условия передачи.`;
  }
  function showFallback(value, hint) {
    $('message-text').value = value;
    $('message-fallback').hidden = false;
    $('message-fallback').querySelector('p').textContent = hint;
  }
  async function contact() {
    const value = message();
    const username = String(config.telegramUsername || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
      showFallback(value, 'контакт Telegram пока не указан. можно скопировать список книг для переписки позже.');
      return;
    }
    let copied = false;
    try { await navigator.clipboard.writeText(value); copied = true; } catch (_) { /* ручное копирование */ }
    showFallback(value, copied ? 'список скопирован. вставьте его в открывшийся чат Telegram.' : 'скопируйте список ниже и вставьте его в открывшийся чат Telegram.');
    window.open(`https://t.me/${username}`, '_blank', 'noopener,noreferrer');
  }
  function updateDetailAction() {
    const button = $('detail-add');
    const chosen = selected.has(activeBook.id);
    button.textContent = chosen ? 'убрать из выбора' : '+ выбрать книгу';
    button.setAttribute('aria-pressed', String(chosen));
  }
  function showDetail(book) {
    activeBook = book;
    $('detail-cover').replaceChildren(cover(book));
    $('detail-category').textContent = book.category || 'жанр не указан';
    $('detail-author').textContent = book.author;
    $('detail-title').textContent = book.title;
    $('detail-description').textContent = book.description || 'описание этой книги скоро появится.';
    $('detail-price').textContent = money(book.price);
    const extras = [];
    if (book.edition) extras.push(`издание: ${book.edition}`);
    if (book.condition) extras.push(`состояние: ${book.condition}`);
    $('detail-extra').replaceChildren(...extras.map(text => create('p', '', text)));
    updateDetailAction();
    openPanel($('book-detail'));
  }
  function openPanel(panel) {
    if (activePanel) closePanel(false);
    lastFocus = document.activeElement;
    panel.hidden = false; $('overlay').hidden = false;
    document.body.classList.add('modal-open'); activePanel = panel;
    panel.querySelector('.icon-button')?.focus();
  }
  function closePanel(restore = true) {
    if (!activePanel) return;
    activePanel.hidden = true; $('overlay').hidden = true;
    document.body.classList.remove('modal-open'); activePanel = null;
    if (restore && lastFocus?.isConnected) lastFocus.focus();
  }
  function trapFocus(event) {
    if (!activePanel || event.key !== 'Tab') return;
    const focusable = [...activePanel.querySelectorAll('button:not([disabled]),a[href],textarea')].filter(node => !node.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function init() {
    $('open-selection').addEventListener('click', () => { renderSelection(); openPanel($('selection-drawer')); });
    $('overlay').addEventListener('click', () => closePanel());
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closePanel()));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); trapFocus(event); });
    $('detail-add').addEventListener('click', () => toggle(activeBook.id));
    $('telegram-button').addEventListener('click', contact);
    $('copy-button').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('message-text').value); $('copy-button').textContent = 'скопировано ✓'; }
      catch (_) { $('message-text').focus(); $('message-text').select(); $('copy-button').textContent = 'выделено, скопируйте текст'; }
    });
    for (const id of ['search', 'category', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { visibleLimit = pageSize; renderCatalog(); });
    $('load-more').addEventListener('click', () => { visibleLimit += pageSize; renderCatalog(); });

    fetch('data/books.json').then(response => { if (!response.ok) throw Error('catalog unavailable'); return response.json(); }).then(data => {
      if (!Array.isArray(data)) throw Error('invalid catalog');
      books = data.filter(book => book && typeof book.id === 'string' && typeof book.author === 'string' && typeof book.title === 'string' && Number.isFinite(book.price) && book.price >= 0);
      const availableBooks = books.filter(available);
      const categories = [...new Set(availableBooks.map(book => book.category).filter(Boolean))].sort(collator.compare);
      $('category').append(...categories.map(category => { const option = create('option', '', category); option.value = category; return option; }));
      $('category').disabled = categories.length === 0;
      $('catalog-stat').textContent = `${availableBooks.reduce((sum, book) => sum + book.quantity, 0)} книг в наличии`;
      selected = new Map([...selected].map(([id, quantity]) => {
        const book = availableBooks.find(item => item.id === id);
        return book ? [id, Math.min(quantity, book.quantity)] : null;
      }).filter(Boolean)); persist();
      renderSelection(); renderCatalog();
    }).catch(() => { $('catalog-stat').textContent = 'каталог недоступен'; $('error-state').hidden = false; $('result-count').textContent = ''; });
  }
  init();
})();
