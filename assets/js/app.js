(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.COGNITIO_CONFIG || {};
  const storageKey = 'cognitioverum:selected:v1';
  const pageSize = 16;
  const collator = new Intl.Collator('ru', { sensitivity: 'base' });
  const money = amount => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₾`;
  // Только отображение: исходные значения автора в JSON остаются без изменений.
  const surnameFirst = new Set([
    'Кристи Агата','Стейнбек Джон','Стоун Ирвинг','Кэрролл Льюис','Хокинг Стивен',
    'Фрейд Зигмунд','Юнг Карл Густав','Фромм Эрих','Спаркс Николас','Кинг Стивен',
    'Карнеги Дейл','Гете Иоганн Вольфганг','Берджесс Энтони','Коэльо Пауло',
    'Ремарк Эрих Мария','Фицджеральд Френсис Скотт','Хаксли Олдос','Рызов Игорь',
    'Наказава Донна Джексон','Диспенза Джо','Пелевин Виктор','Водолазкин Евгений',
    'Франкл Виктор','Берн Эрик','Чалдини Роберт','Безруков Виталий',
    'Канеман Даниэль','Кови Стивен','Норбеков Мирзакарим','Франкл Виктор Эмиль',
    'Кавашима Рюта','Кехо Джон','Макгонигал Келли','Король Александр',
    'Литвак Михаил','Айзексон Уолтер','Фрейд Анна','Пропп Владимир',
    'Кэмпбелл Джозеф','Брэдбери Рэй','Булгаков Михаил','Гоголь Николай Васильевич',
    'Достоевский Федор Михайлович','Пушкин Александр Сергеевич',
    'Чехов Антон Павлович','Шмидт Тамара','Эгер Эдит Ева','Фаулз Джон',
    'Федоренко Павел','Берн Р.','Мэрфи Д.','Гоголь Н.В.'
  ]);
  const authorOverrides = new Map([
    ['Стругацкий Аркадий, Стругацкий Борис', 'Аркадий и Борис Стругацкие'],
    ['Пиз Аллан, Пиз Барбара', 'Аллан и Барбара Пиз'],
    ['Нурмагомедов Адбулманап, Рыбаков Игорь', 'Адбулманап Нурмагомедов, Игорь Рыбаков'],
    ['Хансон Рик, Мендиус Ричард', 'Рик Хансон, Ричард Мендиус'],
    ['Лабковский Михаил и др.', 'Михаил Лабковский и др.']
  ]);
  function displayAuthor(author) {
    if (authorOverrides.has(author)) return authorOverrides.get(author);
    if (!surnameFirst.has(author)) return author;
    const [surname, ...names] = author.split(' ');
    return `${names.join(' ')} ${surname}`;
  }
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
  function cover(book, detail = false) {
    const frame = create('div', 'cover');
    if (typeof book.image === 'string' && /^assets\/books\/[1-9]\d*\.png$/.test(book.image)) {
      const image = create('img');
      image.width = 288;
      image.height = 385;
      image.alt = `обложка книги «${book.title}»`;
      image.loading = detail ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.src = book.image;
      image.onerror = () => { image.remove(); frame.append(placeholder()); };
      frame.append(image);
    } else frame.append(placeholder());
    return frame;
  }
  function placeholder() {
    const box = create('div', 'cover-placeholder');
    box.append(create('span', 'placeholder-emblem', 'CV'));
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
    open.type = 'button'; open.setAttribute('aria-label', `подробнее: ${displayAuthor(book.author)}, ${book.title}`);
    open.append(cover(book)); open.addEventListener('click', () => showDetail(book));
    const info = create('div', 'card-info');
    const title = create('button', 'card-title', book.title);
    title.type = 'button'; title.addEventListener('click', () => showDetail(book));
    const bottom = create('div', 'card-bottom');
    const add = create('button', 'add-button', selected.has(book.id) ? '✓' : '+');
    add.type = 'button'; add.setAttribute('aria-pressed', String(selected.has(book.id)));
    add.setAttribute('aria-label', `${selected.has(book.id) ? 'убрать из выбранных' : 'выбрать'}: ${book.title}`);
    add.addEventListener('click', () => toggle(book.id));
    bottom.append(create('strong', 'card-price', money(book.price)), add);
    info.append(create('p', 'card-author', displayAuthor(book.author)), title);
    if (book.description) info.append(create('p', 'card-description', book.description));
    if (book.category) info.append(create('p', 'card-category', book.category));
    info.append(bottom);
    card.append(open, info);
    return card;
  }
  function results() {
    const query = $('search').value.trim().toLocaleLowerCase('ru');
    const category = $('category').value;
    const sort = $('sort').value;
    const list = books.filter(book => available(book) && (!category || book.category === category) && (!query || `${book.author} ${displayAuthor(book.author)} ${book.title}`.toLocaleLowerCase('ru').includes(query)));
    if (sort === 'az') list.sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.author, b.author));
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price || collator.compare(a.title, b.title));
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price || collator.compare(a.title, b.title));
    return list;
  }
  function renderCatalog() {
    const list = results();
    $('book-grid').replaceChildren(...list.slice(0, visibleLimit).map(renderCard));
    const filtered = $('search').value.trim() || $('category').value;
    $('result-count').hidden = !filtered;
    $('result-count').textContent = filtered ? `найдено: ${list.length}` : '';
    $('empty-state').hidden = list.length !== 0 || books.length === 0;
    $('load-more').hidden = list.length <= visibleLimit;
  }
  function selectionBooks() { return books.filter(book => selected.has(book.id) && available(book)); }
  function renderSelection() {
    const items = selectionBooks();
    const copies = items.reduce((sum, book) => sum + selected.get(book.id), 0);
    $('header-count').textContent = String(copies);
    $('header-count').hidden = copies === 0;
    $('selection-quantity').textContent = `${copies} ${copies % 10 === 1 && copies % 100 !== 11 ? 'книга' : copies % 10 >= 2 && copies % 10 <= 4 && (copies % 100 < 12 || copies % 100 > 14) ? 'книги' : 'книг'}`;
    $('selection-total').textContent = money(items.reduce((sum, book) => sum + book.price * selected.get(book.id), 0));
    $('selection-footer').hidden = items.length === 0;
    if (!items.length) {
      const empty = create('div', 'selection-empty');
      empty.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 8h16l-1.2 12H5.2L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>';
      empty.append(create('p', '', 'пока здесь пусто'));
      const go = create('button', 'empty-go', 'к каталогу'); go.type = 'button'; go.addEventListener('click', () => { closePanel(); $('catalog').scrollIntoView({ behavior: 'smooth' }); });
      empty.append(go); $('selection-items').replaceChildren(empty); return;
    }
    $('selection-items').replaceChildren(...items.map(book => {
      const row = create('div', 'selection-row');
      const details = create('div');
      details.append(create('strong', '', book.title), create('p', '', displayAuthor(book.author)));
      const price = create('span', '', money(book.price * selected.get(book.id)));
      const remove = create('button', 'remove-button');
      remove.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v5m4-5v5"/></svg>';
      remove.type = 'button'; remove.setAttribute('aria-label', `убрать: ${book.title}`);
      remove.addEventListener('click', () => toggle(book.id));
      const controls = create('div', 'quantity-controls');
      const minus = create('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', `уменьшить количество: ${book.title}`);
      minus.addEventListener('click', () => adjust(book.id, -1));
      const plus = create('button', '', '+'); plus.type = 'button'; plus.disabled = selected.get(book.id) >= book.quantity;
      plus.setAttribute('aria-label', `увеличить количество: ${book.title}`); plus.addEventListener('click', () => adjust(book.id, 1));
      controls.append(minus, create('span', '', String(selected.get(book.id))), plus);
      controls.hidden = book.quantity <= 1;
      const thumb = create('div', 'selection-thumb'); thumb.append(cover(book));
      row.append(thumb, details, price, controls, remove); return row;
    }));
  }
  function updateDetailAction() {
    const button = $('detail-add');
    const chosen = selected.has(activeBook.id);
    button.textContent = chosen ? 'убрать из выбора' : '+ выбрать книгу';
    button.setAttribute('aria-pressed', String(chosen));
  }
  function showDetail(book) {
    activeBook = book;
    $('detail-cover').replaceChildren(cover(book, true));
    $('detail-category').textContent = book.category || '';
    $('detail-category').hidden = !book.category;
    $('detail-author').textContent = displayAuthor(book.author);
    $('detail-title').textContent = book.title;
    $('detail-description').textContent = book.description || '';
    $('detail-description').hidden = false;
    $('detail-price').textContent = money(book.price);
    const extras = [];
    if (book.edition) extras.push(`издание: ${book.edition}`);
    if (book.condition) extras.push(`состояние: ${book.condition}`);
    $('detail-extra').replaceChildren(...extras.map(text => create('p', '', text)));
    updateDetailAction();
    openPanel($('book-detail'));
  }
  let drawerCloseTimer = null;
  function openPanel(panel) {
    if (drawerCloseTimer) {
      clearTimeout(drawerCloseTimer);
      drawerCloseTimer = null;
      $('selection-drawer').hidden = true;
      $('selection-drawer').classList.remove('is-closing');
    }
    if (activePanel) activePanel.hidden = true;
    lastFocus = document.activeElement;
    panel.hidden = false;
    $('overlay').hidden = false;
    document.body.classList.add('modal-open');
    activePanel = panel;
    panel.querySelector('.icon-button')?.focus({ preventScroll: true });
  }
  function closePanel(restore = true) {
    if (!activePanel) return;
    const panel = activePanel;
    activePanel = null;
    const finish = () => {
      panel.hidden = true;
      panel.classList.remove('is-closing');
      if (!activePanel) {
        $('overlay').hidden = true;
        document.body.classList.remove('modal-open');
        if (restore && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
      }
    };
    if (panel.id === 'selection-drawer' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.classList.add('is-closing');
      drawerCloseTimer = setTimeout(() => { drawerCloseTimer = null; finish(); }, 180);
    } else finish();
  }
  function trapFocus(event) {
    if (!activePanel || event.key !== 'Tab') return;
    const focusable = [...activePanel.querySelectorAll('button:not([disabled]),a[href],textarea')].filter(node => !node.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  // Safari может игнорировать запрет масштабирования из viewport.
  // Блокируем только жесты масштабирования, сохраняя обычную прокрутку одним пальцем.
  document.addEventListener('gesturestart', event => event.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', event => event.preventDefault(), { passive: false });
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  function init() {
    $('open-selection').addEventListener('click', () => { renderSelection(); openPanel($('selection-drawer')); });
    $('overlay').addEventListener('click', () => closePanel());
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closePanel()));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); trapFocus(event); });
    $('detail-add').addEventListener('click', () => toggle(activeBook.id));
    $('telegram-button').href = `https://t.me/${config.telegramUsername || 'ribka_27'}`;
    $('whatsapp-button').href = config.whatsappUrl || 'https://wa.me/message/MKN3QRCW27DUF1';
    for (const id of ['search', 'category', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { visibleLimit = pageSize; renderCatalog(); });
    $('load-more').addEventListener('click', () => { visibleLimit += pageSize; renderCatalog(); });

    fetch('data/books.json').then(response => { if (!response.ok) throw Error('catalog unavailable'); return response.json(); }).then(data => {
      if (!Array.isArray(data)) throw Error('invalid catalog');
      books = data.filter(book => book && typeof book.id === 'string' && typeof book.author === 'string' && typeof book.title === 'string' && Number.isFinite(book.price) && book.price >= 0);
      const availableBooks = books.filter(available);
      const categories = [...new Set(availableBooks.map(book => book.category).filter(Boolean))].sort(collator.compare);
      $('category').append(...categories.map(category => { const option = create('option', '', category); option.value = category; return option; }));
      $('category').disabled = categories.length === 0;
      const copies = availableBooks.reduce((sum, book) => sum + book.quantity, 0);
      const noun = copies % 10 === 1 && copies % 100 !== 11 ? 'книга' : copies % 10 >= 2 && copies % 10 <= 4 && (copies % 100 < 12 || copies % 100 > 14) ? 'книги' : 'книг';
      $('catalog-stat').textContent = `${availableBooks.length} позиций · ${copies} ${noun} в наличии`;
      selected = new Map([...selected].map(([id, quantity]) => {
        const book = availableBooks.find(item => item.id === id);
        return book ? [id, Math.min(quantity, book.quantity)] : null;
      }).filter(Boolean)); persist();
      renderSelection(); renderCatalog();
    }).catch(() => { $('catalog-stat').textContent = 'каталог недоступен'; $('error-state').hidden = false; $('result-count').textContent = ''; });
  }
  init();
})();
