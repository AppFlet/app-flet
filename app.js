'use strict';
(function () {
  const root = window;
  const VERSION = 12;
  const L = window.R284;
  const KEY = 'r284.v1';
  const NAMEKEY = 'r284.nombre';
  const app = document.getElementById('app');

  // ---------- Datos (se guardan en el celular) ----------
  const blank = () => ({
    clients: [], allTxns: {}, arqueo: {}, logisticaTxns: {},
    baseSemana: { desde: '', logistica: 0, arqueo: 0, arqueo1: 0, arqueo2: 0, cerradaEl: '' },
    notas: [], config: { pinHash: '' }
  });
  function loadDB() {
    try { const r = localStorage.getItem(KEY); if (r) return Object.assign(blank(), JSON.parse(r)); } catch (e) {}
    return blank();
  }
  let DB = loadDB();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); return true; }
    catch (e) { toast('No se pudo guardar en el celular. Hacé un respaldo y avisá.', 5000); return false; }
  }

  // ---------- Estado de pantalla ----------
  let hoyVisto = null;
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => ymd(new Date());
  const shiftDay = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const dateObj = (f) => new Date(f + 'T12:00:00');
  const S = {
    logged: false, stage: DB.config.pinHash ? 'entrar' : 'crear', buf: '', first: '', msg: '',
    name: localStorage.getItem(NAMEKEY) || '',
    tab: 'cierre', sub: null, fecha: today(), q: '', solo: false, open: null, modal: null, toastMsg: '',
    titularUntil: 0, selCli: null, hq: '', edit: null, verInact: false, rJ: true, rX: true,
    todos: (function () { try { return localStorage.getItem('r284.todos') !== '0'; } catch (e) { return true; } })()
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cls = (n) => (Math.abs(n) < 0.005 ? 'zero' : n > 0 ? 'pos' : 'neg');

  let toastTimer = null, toastUntil = 0;
  function showToast() {
    const old = document.getElementById('toast');
    if (old) old.remove();
    if (Date.now() >= toastUntil) return;
    const el = document.createElement('div');
    el.className = 'toast'; el.id = 'toast'; el.setAttribute('role', 'status'); el.textContent = S.toastMsg;
    app.appendChild(el);
  }
  function toast(msg, ms) {
    S.toastMsg = msg; toastUntil = Date.now() + (ms || 2200);
    showToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(showToast, (ms || 2200) + 20);
  }

  async function hashPin(p) {
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('r284:' + p));
      return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381; const s = 'r284:' + p;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return 'x' + h;
    }
  }

  // ---------- Datos del día ----------
  function setVal(f, cid, k, v) {
    if (!DB.allTxns[f]) DB.allTxns[f] = {};
    const day = DB.allTxns[f];
    if (!day[cid]) day[cid] = { compra: 0, efectivo1: 0, efectivo2: 0, mercadopago: 0, transferencia: 0, ajuste: 0 };
    day[cid][k] = v;
    if (L.KEYS.every((x) => !day[cid][x])) delete day[cid];
    day.__meta__ = { editadoPor: S.name, actualizadoEl: new Date().toISOString(), guardado: false };
    persist();
  }
  // Un día "guardado" queda bloqueado. Los días de la app anterior (con sello y sin la marca) también.
  const diaMeta = (f) => (DB.allTxns[f] && DB.allTxns[f].__meta__) || null;
  const diaBloqueado = (f) => { const m = diaMeta(f); return !!m && m.guardado !== false; };
  const recBloq = (rec) => !!rec && rec.guardado !== false;
  function bannerBloq(rec, accion) {
    const d = rec.actualizadoEl ? new Date(rec.actualizadoEl) : null;
    const cuando = d && !isNaN(d) ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return `<button class="banner lockb" data-a="${accion}"><b>🔒 Guardado — destrabar</b><small>${esc(rec.editadoPor || '')}${cuando ? ' · ' + esc(cuando) : ''}</small></button>`;
  }
  const getT = (f, cid) => (DB.allTxns[f] && DB.allTxns[f][cid]) || null;

  // ---------- Pantallas ----------
  const ICON = {
    cierre: '<path d="M7 4h10v16H7z"/><path d="M10 9h4M10 13h4"/>',
    arqueo: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
    logistica: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
    clientes: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 3-5.5 6-5.5s6 2 6 5.5"/><path d="M16 5.5a3 3 0 010 5.5M18 14.5c2 .7 3 2.4 3 5.5"/>',
    mas: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  const TABS = [['cierre', 'Cierre'], ['arqueo', 'Arqueo'], ['logistica', 'Logística'], ['mas', 'Más']];
  const nav = () => '<nav class="nav" aria-label="Pantallas">' + TABS.map(([k, n]) =>
    `<button data-a="tab" data-v="${k}" class="${S.tab === k ? 'act' : ''}"${S.tab === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>${n}</button>`).join('') + '</nav>';

  function header(titulo, conFecha) {
    let lab = dateObj(S.fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    lab = lab.charAt(0).toUpperCase() + lab.slice(1);
    return `<header class="hdr"><div class="row"><h1>${titulo}</h1><button class="chip" data-a="lock" aria-label="Bloquear la app (${esc(S.name)})">${esc(S.name)} · Bloquear</button></div>` +
      (conFecha ? `<div class="datebar"><button data-a="dia" data-v="-1" aria-label="Día anterior">‹</button><div class="d">${esc(lab)}</div><button data-a="dia" data-v="1" aria-label="Día siguiente">›</button></div>` : '') + '</header>';
  }

  function viewLogin() {
    const t = S.stage === 'entrar' ? 'Escribí el PIN del equipo para entrar' : S.stage === 'crear' ? 'Primera vez: elegí un PIN de 4 números' : 'Escribilo otra vez para confirmar';
    const dots = [0, 1, 2, 3].map((i) => `<i class="${i < S.buf.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => `<button data-a="key" data-v="${k}">${k}</button>`).join('');
    return `<div class="login"><h1>APP FLET</h1>
<p>${t}</p>
<div class="dots" role="img" aria-label="${S.buf.length} de 4 números escritos">${dots}</div>
<div class="err" role="alert">${esc(S.msg)}</div>
<label>Tu nombre o iniciales (queda anotado en cada cambio)<input id="name" type="text" value="${esc(S.name)}" maxlength="12" autocomplete="off"></label>
<div class="pad">${keys}<span></span><button data-a="key" data-v="0">0</button><button class="t" data-a="back" aria-label="Borrar">BORRAR</button></div></div>`;
  }

  function dayTotals() { return L.totalesDia(DB, S.fecha); }
  function cobrado(t) { return L.r2(t.efectivo1 + t.efectivo2 + t.mercadopago + t.transferencia); }

  function rowHTML(c) {
    const f = S.fecha, t = getT(f, c.id);
    const antes = L.saldoHasta(DB, c.id, f, false);
    const nuevo = L.r2(antes + L.mov(t));
    if (S.open === c.id || S.todos) {
      const fld = (k, lab, bold) => `<label class="f">${lab}<input type="text" inputmode="decimal" data-k="${k}" data-id="${c.id}" class="${t && t[k] ? 'has' : ''}" placeholder="0,00" value="${t && t[k] ? L.fmtAR(t[k]) : ''}"${diaBloqueado(f) ? ' disabled' : ''}></label>`;
      return `<section class="card open" aria-label="${esc(c.name)}"><button class="crow" data-a="close"><span class="n">${esc(c.name)}</span><span class="s" style="margin:0">Saldo anterior ${L.fmtAR(antes)}${S.todos ? '' : ' · cerrar ▲'}</span></button>
<div class="grid">${fld('compra', 'Compra')}${fld('efectivo1', 'Efectivo COB 1')}${fld('efectivo2', 'Efectivo COB 2')}${fld('mercadopago', 'MercadoPago')}${fld('transferencia', 'Transferencia')}${fld('ajuste', 'Ajuste (+ / −)')}</div>
<div class="new"><span class="a">Saldo nuevo</span><span class="b ${cls(nuevo)}" id="new-${c.id}">${L.fmtAR(nuevo)}</span></div></section>`;
    }
    const pag = t ? L.r2(t.efectivo1 + t.efectivo2 + t.mercadopago + t.transferencia) : 0;
    const sub = t ? `Compra ${L.fmtAR(t.compra)} · Pagos ${L.fmtAR(pag)}${t.ajuste ? ' · Ajuste ' + L.fmtAR(t.ajuste) : ''}` : 'Sin movimientos hoy';
    return `<div class="card"><button class="crow" data-a="open" data-v="${c.id}"><span><span class="n">${esc(c.name)}</span><span class="s">${esc(sub)}</span></span><span class="sal ${cls(nuevo)}">${L.fmtAR(nuevo)}</span></button></div>`;
  }

  function listHTML() {
    if (!DB.clients.length) return '<div class="empty">Todavía no hay clientes.<br>Andá a <b>Más</b> y tocá <b>Restaurar</b> para cargar tu respaldo.</div>';
    const q = norm(S.q.trim());
    const f = S.fecha;
    const rows = DB.clients.filter((c) => c.active !== false).filter((c) => {
      if (q && !norm(c.name).includes(q)) return false;
      if (S.open === c.id) return true;
      if (S.solo) return Math.abs(L.saldoHasta(DB, c.id, f, true)) >= 0.005 || !!getT(f, c.id);
      return true;
    });
    if (!rows.length) return '<div class="empty">No hay clientes con ese filtro.</div>';
    return rows.map(rowHTML).join('');
  }

  function footHTML() {
    const t = dayTotals();
    return `<div class="t">Compras del día<b id="tot-compras">${L.fmtAR(t.compras)}</b></div><div class="t">Cobrado<b id="tot-cobrado">${L.fmtAR(cobrado(t))}</b></div>${diaBloqueado(S.fecha) ? '<button class="btn ghost" data-a="destrabar">🔒 DESTRABAR</button>' : '<button class="btn green" data-a="guardar">GUARDAR DÍA</button>'}`;
  }

  function lockBanner() {
    const m = diaMeta(S.fecha) || {}, d = m.actualizadoEl ? new Date(m.actualizadoEl) : null;
    const cuando = d && !isNaN(d) ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return `<div style="padding:8px 12px 0"><button class="banner lockb" data-a="destrabar"><b>🔒 Día guardado — destrabar el día completo</b><small>${esc(m.editadoPor || '')}${cuando ? ' · ' + esc(cuando) : ''}</small></button></div>`;
  }
  function confirmDestrabarRec(tipo) {
    const k = tipo === 'arqueo' ? 'arqueo' : 'logisticaTxns', nom = tipo === 'arqueo' ? 'el Arqueo' : 'la Logística';
    S.modal = { title: '¿Destrabar ' + nom + '?', ok: 'DESTRABAR', danger: true,
      text: `Se puede volver a editar ${nom} del <b>${esc(fechaLarga(S.fecha))}</b>. Acordate de guardar al terminar.`,
      onOk: () => { const r = DB[k][S.fecha]; if (r) { r.guardado = false; r.editadoPor = S.name; r.actualizadoEl = new Date().toISOString(); } if (persist()) toast('Destrabado', 3000); } };
    render();
  }
  function confirmDestrabar() {
    S.modal = { title: '¿Destrabar el día completo?', ok: 'DESTRABAR', danger: true,
      text: `Se pueden volver a editar <b>todos los clientes</b> del <b>${esc(fechaLarga(S.fecha))}</b>. Acordate de tocar GUARDAR DÍA al terminar.`,
      onOk: () => { const m = diaMeta(S.fecha); if (m) { m.guardado = false; m.actualizadoEl = new Date().toISOString(); m.editadoPor = S.name; } if (persist()) toast('Día destrabado', 3000); } };
    render();
  }
  function viewCierre() {
    const dom = dateObj(S.fecha).getDay() === 0;
    return header('Cierre del día', true) +
      (dom ? '<div style="padding:8px 12px 0"><div class="banner">Es domingo: normalmente no se trabaja. Podés cargar igual si hace falta.</div></div>' : '') +
      (diaBloqueado(S.fecha) ? lockBanner() : '') +
      `<div class="search"><input id="q" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${esc(S.q)}"><button class="btn sm ${S.solo ? 'on' : 'ghost'}" data-a="solo" aria-pressed="${S.solo}">Con saldo</button><button class="btn sm ${S.todos ? 'on' : 'ghost'}" data-a="todos" aria-pressed="${S.todos}">${S.todos ? 'Todos abiertos' : 'Abrir todos'}</button></div>` +
      `<div class="body" id="list">${listHTML()}</div><div class="foot" id="foot">${footHTML()}</div>` + nav();
  }

  function viewStub(titulo, texto) {
    return header(titulo, false) + `<div class="stub"><b>${titulo}</b><span>${texto}</span></div>` + nav();
  }

  const LOCK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#B7791F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="pide PIN de titular"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  const fechaLarga = (f) => { const t = dateObj(f).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const fechaCorta = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
  const subHeader = (t, extra) => `<header class="hdr"><div class="row"><button class="chip" data-a="subback" aria-label="Volver">‹ Volver</button><h1 style="font-size:20px">${t}</h1>${extra || '<span style="width:76px"></span>'}</div></header>`;

  function viewMasRouter() {
    switch (S.sub) {
      case 'historial': return viewHistorial();
      case 'clientes': return viewClientes();
      case 'cform': return viewCForm();
      case 'notas': return viewNotas();
      case 'respaldo': return viewRespaldo();
      case 'archivar': return viewArchivar();
      case 'pasar': return viewPasar();
      case 'retiros': return viewRetiros();
      case 'resumen': return viewResumen();
      default: return viewMas();
    }
  }

  function viewMas() {
    const dias = Object.keys(DB.allTxns).length;
    const sab = new Date().getDay() === 6;
    const row = (v, t, sub, lock) => `<button class="mrow" data-a="menu" data-v="${v}"><span><b>${t}</b><small>${sub}</small></span>${lock ? LOCK : '<span aria-hidden="true">›</span>'}</button>`;
    return header('Más', false) + `<div class="body">
${sab ? '<div class="banner"><b>Es sábado:</b> hacé el respaldo y guardalo en tu Drive.</div>' : ''}
${row('limpiar', 'Limpiar (Cierre diario)', 'Borra compras y pagos de ' + esc(fechaLarga(S.fecha)), true)}
${DB.undo ? `<button class="mrow" data-a="menu" data-v="undo" style="border-color:#E8B65A;background:#FFF8E8"><span><b>Deshacer la última limpieza</b><small>Día ${esc(fechaLarga(DB.undo.fecha))}</small></span><span aria-hidden="true">↶</span></button>` : ''}
${row('resumen', 'Resumen del día', 'Cierre, arqueo y logística en un texto para compartir', false)}
${row('retiros', 'Retiros del mes', 'Retiro NF y ajustes de ROKE y NICOLAS', true)}
${row('historial', 'Historial', 'Movimientos y saldo de cada cliente', false)}
${row('clientes', 'Clientes', 'Altas, bajas, mail, teléfono y saldo inicial', true)}
${row('notas', 'Bitácora', 'Notas del día', false)}
${row('pasar', 'Pasar datos entre celulares', 'Enviar cierre, sumar cierre y saldos', false)}
${row('respaldo', 'Respaldo', 'Hacer o restaurar el archivo de respaldo', true)}
${row('archivar', 'Limpiar historial viejo', 'Si la app se pone lenta: borra días anteriores y deja los saldos', true)}
<div class="empty" style="padding:14px 6px;font-size:13px">${DB.clients.length} clientes · ${dias} días guardados en este celular · versión ${VERSION}</div></div>` + nav();
  }

  function viewRespaldo() {
    return subHeader('Respaldo') + `<div class="body"><section class="card sec"><h2>Respaldo</h2><p>Hacé un respaldo seguido. Es un archivo que queda en Descargas y se puede mandar por WhatsApp.</p>
<label class="chk"><input type="checkbox" data-opt="rJ" ${S.rJ ? 'checked' : ''}><span><b>Archivo de respaldo (.json)</b><small>Sirve para restaurar la app</small></span></label>
<label class="chk"><input type="checkbox" data-opt="rX" ${S.rX ? 'checked' : ''}><span><b>Planilla de Excel (.xlsx)</b><small>Saldos, movimientos, arqueo y logística para mirar o imprimir</small></span></label>
<div class="btns"><button class="btn" data-a="respaldo">Hacer respaldo</button><button class="btn red" data-a="restaurar">Restaurar</button></div>
<input id="file" type="file" accept=".json,application/json" hidden></section></div>` + nav();
  }

  // ---- Historial ----
  function histRows(id) {
    const c = DB.clients.find((x) => x.id === id); let s = Number(c.saldoInicial) || 0; const out = [];
    for (const d of Object.keys(DB.allTxns).sort()) {
      const t = DB.allTxns[d][id]; if (!t) continue;
      s = L.r2(s + L.mov(t));
      out.push({ d, compra: t.compra || 0, pago: L.r2((t.efectivo1 || 0) + (t.efectivo2 || 0) + (t.mercadopago || 0) + (t.transferencia || 0)), aj: t.ajuste || 0, saldo: s });
    }
    return out.reverse();
  }
  function histListHTML() {
    const q = norm(S.hq.trim());
    const rows = DB.clients.filter((c) => !q || norm(c.name).includes(q)).map((c) => {
      const sa = L.saldoHasta(DB, c.id, '9999-12-31', true);
      return `<div class="card"><button class="crow" data-a="hsel" data-v="${c.id}"><span class="n">${esc(c.name)}${c.active === false ? ' <small>(inactivo)</small>' : ''}</span><span class="sal ${cls(sa)}">${L.fmtAR(sa)}</span></button></div>`;
    });
    return rows.join('') || '<div class="empty">No hay clientes con ese nombre.</div>';
  }
  function viewHistorial() {
    if (!S.selCli) return subHeader('Historial') + `<div class="search"><input id="hq" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${esc(S.hq)}"></div><div class="body" id="list2">${histListHTML()}</div>` + nav();
    const c = DB.clients.find((x) => x.id === S.selCli); if (!c) { S.selCli = null; return viewHistorial(); }
    const sa = L.saldoHasta(DB, c.id, '9999-12-31', true);
    const rows = histRows(c.id).map((r) => `<div class="hrow"><span><b>${fechaCorta(r.d)}</b>${r.aj ? `<small>Ajuste ${L.fmtAR(r.aj)}</small>` : ''}</span><span>${L.fmtAR(r.compra)}</span><span class="neg">${L.fmtAR(r.pago)}</span><b class="${cls(r.saldo)}">${L.fmtAR(r.saldo)}</b></div>`).join('');
    return subHeader(esc(c.name)) + `<div class="body"><div class="card" style="display:flex;justify-content:space-between"><span>Saldo actual</span><b class="sal ${cls(sa)}">${L.fmtAR(sa)}</b></div>
<div class="card" style="padding:0;overflow:hidden"><div class="hrow hh"><span>Día</span><span>Compra</span><span>Pagó</span><span>Saldo</span></div>${rows || '<div class="empty">Sin movimientos todavía.</div>'}<div class="hrow"><span><b>${c.saldoDesde ? 'Antes del ' + fechaCorta(c.saldoDesde) : 'Inicio'}</b></span><span></span><span></span><b>${L.fmtAR(c.saldoInicial)}</b></div></div></div>` + nav();
  }

  // ---- Clientes ----
  function cliListHTML() {
    const q = norm(S.hq.trim());
    const rows = DB.clients.filter((c) => (S.verInact || c.active !== false) && (!q || norm(c.name).includes(q))).map((c) => {
      const sub = [c.email, c.telefono].filter(Boolean).join(' · ') || 'Sin mail ni teléfono';
      return `<div class="card" ${c.active === false ? 'style="opacity:.65"' : ''}><button class="crow" data-a="cedit" data-v="${c.id}"><span><span class="n">${esc(c.name)}${c.active === false ? ' (inactivo)' : ''}</span><span class="s">${esc(sub)}</span></span><span class="sal zero">Saldo inicial<br>${L.fmtAR(c.saldoInicial)}</span></button></div>`;
    });
    return rows.join('') || '<div class="empty">No hay clientes con ese filtro.</div>';
  }
  function viewClientes() {
    return subHeader('Clientes', '<button class="chip" data-a="cnew" style="background:#F2B544;color:#2A1B00;font-weight:800">+ Nuevo</button>') +
      `<div class="search"><input id="hq" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${esc(S.hq)}"><button class="btn sm ${S.verInact ? 'on' : 'ghost'}" data-a="cinact" aria-pressed="${S.verInact}">Ver inactivos</button></div><div class="body" id="list2">${cliListHTML()}</div>` + nav();
  }
  function viewCForm() {
    const nuevo = S.edit === 'nuevo';
    const c = nuevo ? { name: '', saldoInicial: 0, email: '', telefono: '', active: true } : DB.clients.find((x) => x.id === S.edit);
    if (!c) { S.sub = 'clientes'; return viewClientes(); }
    return subHeader(nuevo ? 'Cliente nuevo' : 'Editar cliente') + `<div class="body">
<section class="card" style="display:flex;flex-direction:column;gap:12px">
<label class="f">Nombre<input id="c-name" type="text" style="text-align:left" value="${esc(c.name)}" autocomplete="off"></label>
<label class="f">Saldo inicial<input id="c-saldo" type="text" inputmode="decimal" value="${c.saldoInicial ? L.fmtAR(c.saldoInicial) : ''}" placeholder="0,00"></label>
<p style="margin:0;font-size:12px;color:#55625F;line-height:1.35">Es el saldo con el que arrancó la cuenta. Si lo cambiás, cambia el saldo actual del cliente.</p>
<label class="f">Mail<input id="c-mail" type="email" inputmode="email" style="text-align:left" value="${esc(c.email)}" autocomplete="off"></label>
<label class="f">Teléfono<input id="c-tel" type="tel" style="text-align:left" value="${esc(c.telefono)}" autocomplete="off"></label>
<button class="btn green" data-a="csave">GUARDAR CLIENTE</button>
${nuevo ? '' : `<button class="btn ${c.active === false ? 'ghost' : 'red'}" data-a="ctoggle">${c.active === false ? 'Volver a activar' : 'Desactivar cliente'}</button>`}
</section>${nuevo ? '' : '<p style="margin:0;font-size:12px;color:#55625F;line-height:1.4">Un cliente desactivado deja de aparecer en el Cierre, pero su historial queda guardado.</p>'}</div>` + nav();
  }

  // ---- Bitácora ----
  function viewNotas() {
    const lista = DB.notas.slice().reverse().map((n) => `<article class="card"><div style="display:flex;justify-content:space-between;font-size:12px;color:#55625F"><b style="color:#0F4C4F">${esc(fechaLarga(n.fecha))}</b><span>${esc(n.usuario)}</span></div><p style="margin:6px 0 0;font-size:16px;line-height:1.4;white-space:pre-wrap">${esc(n.texto)}</p></article>`).join('');
    return subHeader('Bitácora') + `<div class="body">${lista || '<div class="empty">Todavía no hay notas.</div>'}</div>
<div class="foot" style="align-items:flex-end"><label class="f" style="flex:1">Nueva nota<input id="n-text" type="text" style="text-align:left" placeholder="Escribí acá…" autocomplete="off"></label><button class="btn green" data-a="nsave">GUARDAR</button></div>` + nav();
  }

  function modalHTML() {
    if (!S.modal) return '';
    const m = S.modal;
    const pins = m.pin ? `<input id="mpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN" placeholder="PIN de 4 números" style="height:52px;border-radius:12px;border:1px solid #C9D3D0;padding:0 14px;font-size:22px;letter-spacing:6px;text-align:center">${m.pin === 2 ? '<input id="mpin2" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="Repetir PIN" placeholder="Repetilo" style="height:52px;border-radius:12px;border:1px solid #C9D3D0;padding:0 14px;font-size:22px;letter-spacing:6px;text-align:center">' : ''}<div id="merr" role="alert" style="color:#B3261E;font-weight:700;min-height:18px;font-size:14px"></div>` : '';
    return `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.title)}"><div class="box"><h3>${esc(m.title)}</h3><p>${m.text}</p>${pins}<div class="btns"><button class="btn ghost" data-a="m-no">${esc(m.cancel || 'ATRÁS')}</button><button class="btn ${m.danger ? 'red' : 'green'}" data-a="m-ok">${esc(m.ok)}</button></div></div></div>`;
  }

  function render() {
    let h;
    if (!S.logged) h = viewLogin();
    else if (S.tab === 'cierre') h = viewCierre();
    else if (S.tab === 'arqueo') h = viewArqueo();
    else if (S.tab === 'logistica') h = viewLogistica();
    else h = viewMasRouter();
    app.innerHTML = h + modalHTML();
    showToast();
    const mp = document.getElementById('mpin'); if (mp) mp.focus();
  }

  function refreshList() { const l = document.getElementById('list'); if (l) l.innerHTML = listHTML(); }
  function refreshFoot() { const f = document.getElementById('foot'); if (f) f.innerHTML = footHTML(); }

  // ---------- PIN ----------
  async function pinDone() {
    const name = S.name.trim();
    if (S.stage === 'crear') { S.first = S.buf; S.buf = ''; S.stage = 'confirmar'; S.msg = ''; return render(); }
    if (S.stage === 'confirmar') {
      if (S.buf !== S.first) { S.buf = ''; S.first = ''; S.stage = 'crear'; S.msg = 'No coinciden. Elegí el PIN de nuevo.'; return render(); }
      if (!name) { S.buf = ''; S.first = ''; S.stage = 'crear'; S.msg = 'Escribí tu nombre o iniciales y empezá de nuevo.'; return render(); }
      DB.config.pinHash = await hashPin(S.buf);
      persist(); S.logged = true; S.buf = ''; S.first = ''; S.msg = ''; S.stage = 'entrar'; return render();
    }
    if (!name) { S.buf = ''; S.msg = 'Escribí tu nombre o iniciales.'; return render(); }
    const ok = (await hashPin(S.buf)) === DB.config.pinHash;
    S.buf = '';
    if (!ok) { S.msg = 'PIN incorrecto.'; return render(); }
    S.logged = true; S.msg = ''; render();
  }

  // ---------- Respaldo ----------
  function bajar(nombre, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // Para mandar por WhatsApp/mail si el celular deja; si no, se baja a Descargas.
  async function entregar(nombre, blob, aviso) {
    try {
      const f = new File([blob], nombre, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nombre }); return toast('Listo, enviado.', 3000); }
    } catch (e) { if (e && e.name === 'AbortError') return toast('Se canceló el envío.', 3000); }
    bajar(nombre, blob); toast(aviso || 'Archivo guardado en Descargas.', 4500);
  }
  const datosCompletos = () => ({ exportedAt: new Date().toISOString(), clients: DB.clients, allTxns: DB.allTxns, arqueo: DB.arqueo, logisticaTxns: DB.logisticaTxns, baseSemana: DB.baseSemana, notas: DB.notas });
  function hacerRespaldo() {
    if (!S.rJ && !S.rX) return toast('Elegí al menos un archivo.', 3000);
    let demora = 0;
    if (S.rJ) { bajar('respaldo-cuenta-corriente-' + today() + '.json', new Blob([JSON.stringify(datosCompletos(), null, 2)], { type: 'application/json' })); demora = 700; }
    if (S.rX) setTimeout(() => bajar('planilla-cuenta-corriente-' + today() + '.xlsx', new Blob([root.R284X.makeXlsx(L.filasExcel(DB))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), demora);
    toast('Respaldo hecho. Buscalo en Descargas.', 3500);
  }

  function leerArchivo(file) {
    const r = new FileReader();
    r.onerror = () => toast('No se pudo leer el archivo. No se cambió nada.', 4000);
    r.onload = () => {
      let o;
      try { o = JSON.parse(r.result); } catch (e) { return toast('Ese archivo no es un respaldo válido. No se cambió nada.', 4500); }
      if (!o || !Array.isArray(o.clients) || typeof o.allTxns !== 'object' || !o.allTxns) return toast('Ese archivo no parece un respaldo. No se cambió nada.', 4500);
      const dias = Object.keys(o.allTxns).length;
      const sin = L.cargasSinEnviar(DB, o);
      const aviso = sin ? `<br><br><b style="color:#B3261E">Ojo: este celular tiene ${sin} cargas que NO están en el archivo y se perderían.</b>` : '';
      S.modal = {
        title: '¿Restaurar este respaldo?', ok: 'RESTAURAR', danger: true,
        text: `Trae <b>${o.clients.length} clientes</b> y <b>${dias} días</b>${o.exportedAt ? ' (hecho el ' + esc(o.exportedAt.slice(0, 10)) + ')' : ''}.<br><br><b>Reemplaza todo lo que hay ahora en este celular.</b>${aviso}`,
        onOk: () => {
          DB = Object.assign(blank(), { clients: o.clients, allTxns: o.allTxns, arqueo: o.arqueo || {}, logisticaTxns: o.logisticaTxns || {}, baseSemana: o.baseSemana || blank().baseSemana, notas: o.notas || [], config: DB.config });
          if (persist()) toast('Respaldo efectuado', 3000);
        }
      };
      render();
    };
    r.readAsText(file);
  }

  // ---------- Arqueo ----------
  const fv = (n) => (n ? L.fmtAR(n) : '');
  const inp = (id, lab, val, attr, extra) => `<label class="f">${lab}<input type="text" inputmode="decimal" id="${id}" ${attr} placeholder="0,00" value="${val}" ${extra || ''} class="${val ? 'has' : ''}"></label>`;
  function difBadge(n, pos, neg) {
    if (Math.abs(n) < 0.005) return '<span class="bdg okb">Cierra</span>';
    return `<span class="bdg warn">${n > 0 ? pos : neg} ${L.fmtAR(Math.abs(n))}</span>`;
  }
  function resLine(label, id, n, pos, neg, big) {
    return `<div class="rline${big ? ' big' : ''}"><span>${label}</span><span id="${id}">${difBadge(n, pos, neg)}</span></div>`;
  }
  function arVals() {
    const g = (id) => { const e = document.getElementById(id); const n = e ? L.parseAR(e.value) : 0; return isNaN(n) ? 0 : n; };
    return { depositadoGeneral: g('ar-gen'), depositado1: g('ar-d1'), depositado2: g('ar-d2'), retiroNF: g('ar-nf') };
  }
  function arCalc() {
    const rec = arVals(), x = L.arqueoDia(DB, S.fecha, rec), p = L.arqueoAcum(DB, S.fecha, false);
    const set = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
    set('ar-rdg', difBadge(x.dg, 'Faltan', 'Sobran')); set('ar-rag', difBadge(L.r2(p.g + x.dg), 'Faltan', 'Sobran'));
    set('ar-rd1', difBadge(x.d1, 'Faltan', 'Sobran')); set('ar-ra1', difBadge(L.r2(p.c1 + x.d1), 'Faltan', 'Sobran'));
    set('ar-rd2', difBadge(x.d2, 'Faltan', 'Sobran')); set('ar-ra2', difBadge(L.r2(p.c2 + x.d2), 'Faltan', 'Sobran'));
  }
  function viewArqueo() {
    const f = S.fecha, rec = DB.arqueo[f] || {}, t = L.totalesDia(DB, f);
    const x = L.arqueoDia(DB, f), p = L.arqueoAcum(DB, f, false);
    const line = (l, v) => `<div class="rline"><span>${l}</span><b>${L.fmtAR(v)}</b></div>`;
    const R = (l, id, n, big) => `<div class="rline${big ? ' big' : ''}"><span>${l}</span><span id="${id}">${difBadge(n, 'Faltan', 'Sobran')}</span></div>`;
    const lk = recBloq(DB.arqueo[f]);
    const html = header('Arqueo', true) + `<div class="body">${lk ? bannerBloq(DB.arqueo[f], 'adestr') : ''}
<section class="card sec"><h2>Lo que se cobró (viene del Cierre)</h2>${line('Efectivo COB 1', t.efectivo1)}${line('Efectivo COB 2', t.efectivo2)}${line('MercadoPago', t.mercadopago)}${line('Transferencias', t.transferencia)}</section>
<section class="card sec"><h2>Lo que se depositó</h2><div class="grid2">
${inp('ar-d1', 'Depositado COB 1', fv(rec.depositado1), 'data-arq="1"')}${inp('ar-d2', 'Depositado COB 2', fv(rec.depositado2), 'data-arq="1"')}
${inp('ar-nf', 'Retiro no facturado', fv(rec.retiroNF), 'data-arq="1"')}${inp('ar-gen', 'Depositado general', fv(rec.depositadoGeneral), 'data-arq="gen"', rec.depositadoGeneral != null && DB.arqueo[f] ? 'data-touched="1"' : '')}
</div><p style="margin:10px 0 0">El general se completa solo (COB 1 + COB 2 − retiro). Si el banco te dio otro número, escribilo.</p></section>
<section class="card res">${R('Diferencia del día', 'ar-rdg', x.dg, true)}${R('Acumulada general', 'ar-rag', L.r2(p.g + x.dg))}${R('COB 1 · día', 'ar-rd1', x.d1)}${R('COB 1 · acumulada', 'ar-ra1', L.r2(p.c1 + x.d1))}${R('COB 2 · día', 'ar-rd2', x.d2)}${R('COB 2 · acumulada', 'ar-ra2', L.r2(p.c2 + x.d2))}
<p style="margin:8px 0 0;font-size:12px;color:#55625F">"Faltan" = se cobró más de lo que se depositó. "Sobran" = se depositó de más.</p></section></div>
<div class="foot">${lk ? '<button class="btn ghost" data-a="adestr" style="flex:1">🔒 DESTRABAR ARQUEO</button>' : '<button class="btn green" data-a="asave" style="flex:1">GUARDAR ARQUEO</button>'}</div>` + nav();
    return lk ? html.replace(/ data-arq=/g, ' disabled data-arq=') : html;
  }
  // Cuando están guardados los 3 pasos del día (Cierre, Arqueo y Logística) se ofrece el respaldo.
  function preguntarRespaldo() {
    const f = S.fecha;
    if (!diaBloqueado(f) || !recBloq(DB.arqueo[f]) || !recBloq(DB.logisticaTxns[f])) return;
    S.modal = { title: 'Día completo guardado', ok: 'HACER RESPALDO', cancel: 'MÁS TARDE',
      text: `Ya guardaste Cierre, Arqueo y Logística del <b>${esc(fechaLarga(f))}</b>.<br><br>¿Hacés el respaldo ahora?`, onOk: hacerRespaldo };
    render();
  }
  function guardarArqueo() {
    const ids = ['ar-d1', 'ar-d2', 'ar-nf', 'ar-gen'];
    if (ids.some((i) => isNaN(L.parseAR(document.getElementById(i).value)))) return toast('Hay un número que no es válido.', 3000);
    const v = arVals();
    DB.arqueo[S.fecha] = Object.assign(v, { editadoPor: S.name, actualizadoEl: new Date().toISOString(), guardado: true });
    if (persist()) { toast('Arqueo guardado y bloqueado'); render(); preguntarRespaldo(); }
  }

  // ---------- Logística ----------
  function lgVals() {
    const g = (id) => { const e = document.getElementById(id); const n = e ? L.parseAR(e.value) : 0; return isNaN(n) ? 0 : n; };
    return { efectivoAyer: g('lg-ef'), mercadopagoAyer: g('lg-mp'), transferenciaAyer: g('lg-tr'), pagosAfectado: g('lg-pa'), correccion: g('lg-co') };
  }
  function lgCalc() {
    const d = L.difLog(lgVals()), a = L.logAcum(DB, S.fecha, false);
    const set = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
    set('lg-rd', difBadge(d, 'Falta acreditar', 'Acreditó de más')); set('lg-ra', difBadge(L.r2(a + d), 'Falta acreditar', 'Acreditó de más'));
  }
  function viewLogistica() {
    const f = S.fecha, saved = DB.logisticaTxns[f], sug = L.sugLogistica(DB, f), rec = saved || { efectivoAyer: sug.efectivoAyer, mercadopagoAyer: sug.mercadopagoAyer, transferenciaAyer: sug.transferenciaAyer };
    const d = L.difLog(rec), a = L.logAcum(DB, f, false);
    const hint = saved ? '' : `<div class="banner" style="font-size:13px">Valores sugeridos${sug.fechaCobro ? ' con el Cierre del ' + esc(fechaCorta(sug.fechaCobro)) : ''}${sug.fechaArqueo ? ' y el Arqueo del ' + esc(fechaCorta(sug.fechaArqueo)) : ''}. Revisalos antes de guardar.</div>`;
    const lk = recBloq(saved);
    const html = header('Logística', true) + `<div class="body">${lk ? bannerBloq(saved, 'ldestr') : ''}${hint}
<section class="card sec"><h2>Lo que se cobró ayer</h2><div class="grid2">
${inp('lg-ef', 'Efectivo depositado', fv(rec.efectivoAyer), 'data-lg="1"')}${inp('lg-mp', 'MercadoPago', fv(rec.mercadopagoAyer), 'data-lg="1"')}
${inp('lg-tr', 'Transferencia', fv(rec.transferenciaAyer), 'data-lg="1"')}</div></section>
<section class="card sec"><h2>Lo que acreditó la logística</h2><div class="grid2">
${inp('lg-pa', 'Pagos afectados', fv(rec.pagosAfectado), 'data-lg="1"')}${inp('lg-co', 'Corrección (+ / −)', fv(rec.correccion), 'data-lg="1"')}</div></section>
<section class="card res"><div class="rline big"><span>Diferencia del día</span><span id="lg-rd">${difBadge(d, 'Falta acreditar', 'Acreditó de más')}</span></div>
<div class="rline"><span>Diferencia acumulada</span><span id="lg-ra">${difBadge(L.r2(a + d), 'Falta acreditar', 'Acreditó de más')}</span></div></section></div>
<div class="foot">${lk ? '<button class="btn ghost" data-a="ldestr" style="flex:1">🔒 DESTRABAR LOGÍSTICA</button>' : '<button class="btn green" data-a="lsave" style="flex:1">GUARDAR LOGÍSTICA</button>'}</div>` + nav();
    return lk ? html.replace(/ data-lg=/g, ' disabled data-lg=') : html;
  }
  function guardarLogistica() {
    const ids = ['lg-ef', 'lg-mp', 'lg-tr', 'lg-pa', 'lg-co'];
    if (ids.some((i) => isNaN(L.parseAR(document.getElementById(i).value)))) return toast('Hay un número que no es válido.', 3000);
    DB.logisticaTxns[S.fecha] = Object.assign(lgVals(), { editadoPor: S.name, actualizadoEl: new Date().toISOString(), guardado: true });
    if (persist()) { toast('Logística guardada y bloqueada'); render(); preguntarRespaldo(); }
  }

  // ---------- Resumen del día y Retiros ----------
  async function compartirTexto(txt) {
    try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(txt); toast('Resumen copiado. Pegalo en WhatsApp.', 3500); } catch (e) { toast('No se pudo copiar. Usá Descargar.', 3500); }
  }
  function viewResumen() {
    const f = S.rdia || S.fecha;
    return subHeader('Resumen del día') + `<div class="body">
<div class="datebar" style="background:#1B6468;margin:0"><button data-a="rdia" data-v="-1" aria-label="Día anterior">‹</button><span class="d">${esc(fechaLarga(f))}</span><button data-a="rdia" data-v="1" aria-label="Día siguiente">›</button></div>
<pre class="resu">${esc(L.textoResumen(DB, f))}</pre>
<div class="btns"><button class="btn green" data-a="r-comp">COMPARTIR</button><button class="btn ghost" data-a="r-desc">DESCARGAR</button></div></div>` + nav();
  }
  function viewRetiros() {
    const ym = S.rmes || today().slice(0, 7), r = L.retirosMes(DB, ym), [y, m] = ym.split('-').map(Number);
    const mes = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    const filas = r.filas.map((x) => `<div class="card" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><span><b>${esc(x.fecha.slice(8, 10) + '/' + x.fecha.slice(5, 7) + '/' + x.fecha.slice(0, 4))}</b><small style="display:block;color:#55625F">${x.nf ? 'Retiro NF ' + L.fmtAR(x.nf) : ''}${x.ajustes.map((j) => (x.nf ? ' · ' : '') + 'Ajuste ' + esc(j.nombre) + ' ' + L.fmtAR(j.monto)).join('')}</small></span><b>${L.fmtAR(x.total)}</b></div>`).join('');
    return subHeader('Retiros') + `<div class="body">
<div class="datebar" style="background:#1B6468;margin:0"><button data-a="rmes" data-v="-1" aria-label="Mes anterior">‹</button><span class="d">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))}</span><button data-a="rmes" data-v="1" aria-label="Mes siguiente">›</button></div>
<div class="card res" style="padding:16px"><div style="font-size:13px;color:#55625F">TOTAL RETIRADO EN EL MES</div><div style="font-size:30px;font-weight:800;margin:4px 0">$${L.fmtAR(r.total)}</div><div style="font-size:12px;color:#55625F">Suma el retiro no facturado del Arqueo y los ajustes de ROKE y NICOLAS. Cada mes empieza de cero.</div></div>
${filas || '<div class="empty">No hay retiros en este mes.</div>'}</div>` + nav();
  }

  // ---------- Pasar datos entre celulares ----------
  function viewPasar() {
    const un = Date.now() < S.titularUntil, c = L.armarCierre(DB, S.fecha, S.name), n = Object.keys(c.dia).length;
    const nada = !n && !c.arqueo && !c.logistica;
    return subHeader('Pasar datos') + `<div class="body">
<section class="card sec"><h2>Enviar cierre (empleado)</h2><p>Manda lo que cargaste el <b>${esc(fechaLarga(S.fecha))}</b>: ${n} ${n === 1 ? 'cliente' : 'clientes'}${c.arqueo ? ', arqueo' : ''}${c.logistica ? ', logística' : ''}. Para cambiar el día, volvé a Cierre y elegí otra fecha.</p>
<button class="btn green" data-a="p-enviar" ${nada ? 'disabled style="opacity:.4;width:100%"' : 'style="width:100%"'}>ENVIAR CIERRE</button></section>
<section class="card sec"><h2>Sumar cierre (titular) ${un ? '' : LOCK}</h2><p>Abrí el archivo que te mandó el empleado. Se <b>suma</b> a tus datos: no se borra nada. Si ya tenías algo distinto en un cliente, queda lo tuyo.</p>
${un ? '<label class="btn ghost" style="display:flex;align-items:center;justify-content:center;width:100%">ELEGIR ARCHIVO<input id="file-c" type="file" accept=".json,application/json" hidden></label>' : '<button class="btn ghost" data-a="p-pin" style="width:100%">DESBLOQUEAR CON PIN</button>'}</section>
<section class="card sec"><h2>Enviar datos al día (titular) ${un ? '' : LOCK}</h2><p>Genera un archivo con todos los datos al día (también sirve para mandar una corrección de días anteriores). Los empleados lo reciben con <b>Recibir datos</b>.</p>
${un ? '<button class="btn" data-a="p-saldos" style="width:100%">ENVIAR DATOS</button>' : '<button class="btn ghost" data-a="p-pin" style="width:100%">DESBLOQUEAR CON PIN</button>'}</section>
<section class="card sec"><h2>Recibir datos del titular (empleado)</h2><p>Abrí el archivo que mandó el titular. Se actualizan los saldos y los días corregidos. Lo que ya cargaste hoy sin guardar no se pierde.</p>
<label class="btn ghost" style="display:flex;align-items:center;justify-content:center;width:100%">ELEGIR ARCHIVO<input id="file-s" type="file" accept=".json,application/json" hidden></label></section></div>` + nav();
  }
  function enviarCierre() {
    const c = L.armarCierre(DB, S.fecha, S.name);
    const nom = 'cierre-' + S.fecha + '-' + (S.name || 'equipo').replace(/[^\wÁÉÍÓÚÑáéíóúñ-]/g, '') + '.json';
    entregar(nom, new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }), 'Cierre guardado en Descargas. Mandalo por WhatsApp.');
  }
  function enviarSaldos() {
    const d = Object.assign(datosCompletos(), { tipo: 'saldos-r284' });
    entregar('saldos-actualizados-' + today() + '.json', new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), 'Saldos guardados en Descargas. Mandalos por WhatsApp.');
  }
  function leerSaldos(file) {
    const r = new FileReader();
    r.onerror = () => toast('No se pudo leer el archivo. No se cambió nada.', 4000);
    r.onload = () => {
      let o; try { o = JSON.parse(r.result); } catch (e) { return toast('Ese archivo no es válido. No se cambió nada.', 4500); }
      if (!o || !Array.isArray(o.clients) || !o.allTxns || typeof o.allTxns !== 'object') return toast('Ese archivo no parece de la app. No se cambió nada.', 4500);
      const p = L.recibirDatos(DB, o, false);
      S.modal = { title: '¿Recibir los datos del titular?', ok: 'RECIBIR', danger: false,
        text: `Trae <b>${o.clients.length} clientes</b> y <b>${Object.keys(o.allTxns).length} días</b>. Reemplaza los saldos y los días guardados de este celular.<br><br>Se mantienen tus <b>${p.conservadas}</b> cargas de días sin guardar.${p.reemplazadas ? `<br><br><b style="color:#B3261E">${p.reemplazadas} cargas tuyas de días ya guardados quedan reemplazadas por las del titular.</b>` : ''}`,
        onOk: () => { L.recibirDatos(DB, o, true); if (persist()) toast('Datos recibidos', 3500); } };
      render();
    };
    r.readAsText(file);
  }
  function leerCierre(file) {
    const r = new FileReader();
    r.onerror = () => toast('No se pudo leer el archivo. No se cambió nada.', 4000);
    r.onload = () => {
      let c; try { c = JSON.parse(r.result); } catch (e) { return toast('Ese archivo no es válido. No se cambió nada.', 4500); }
      if (!c || c.tipo !== 'cierre-r284' || !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '') || typeof c.dia !== 'object') return toast('Ese archivo no es un cierre de la app. No se cambió nada.', 4500);
      const p = L.sumarCierre(DB, c, false), lst = (t, a) => a.length ? `<br>${t}: <b>${a.slice(0, 6).map(esc).join(', ')}${a.length > 6 ? ' y ' + (a.length - 6) + ' más' : ''}</b>` : '';
      const hay = p.agregados.length || p.arqueo === 'agregado' || p.logistica === 'agregado';
      S.modal = { title: '¿Sumar este cierre?', ok: hay ? 'SUMAR' : 'ENTENDIDO', danger: false,
        text: `Cierre del <b>${esc(fechaLarga(c.fecha))}</b> mandado por <b>${esc(c.de || '?')}</b>.<br><br>Se agregan <b>${p.agregados.length}</b> clientes${p.arqueo === 'agregado' ? ' + arqueo' : ''}${p.logistica === 'agregado' ? ' + logística' : ''}.<br>Ya estaban iguales: ${p.iguales.length}.${lst('Ya tenían otro dato (queda lo tuyo)', p.conflictos)}${p.arqueo === 'conflicto' ? '<br>El arqueo ya tenía otro dato (queda el tuyo).' : ''}${p.logistica === 'conflicto' ? '<br>La logística ya tenía otro dato (queda la tuya).' : ''}${lst('Clientes que no existen acá (no se suman)', p.desconocidos)}`,
        onOk: () => { if (!hay) return; L.sumarCierre(DB, c, true); S.fecha = c.fecha; if (persist()) toast('Cierre sumado', 3500); } };
      render();
    };
    r.readAsText(file);
  }

  // ---------- Limpiar historial viejo ----------
  function viewArchivar() {
    const corte = S.corte || shiftDay(today(), -90), r = L.resumenCorte(DB, corte);
    const ult = Object.keys(DB.allTxns).sort().pop() || today();
    const ok = r.borrar > 0 && corte <= ult;
    const base = DB.baseSemana && DB.baseSemana.desde ? `<p>Ya hay una limpieza anterior: los datos arrancan desde el <b>${esc(fechaCorta(DB.baseSemana.desde))}</b>.</p>` : '';
    return subHeader('Limpiar historial') + `<div class="body">
<section class="card sec"><h2>Paso 1: elegí el día</h2><p>Se borra todo lo que sea <b>anterior</b> a este día. Ese día y los siguientes quedan.</p>
<label class="f">Borrar lo anterior al<input type="date" id="arc-corte" value="${esc(corte)}" max="${esc(ult)}" style="text-align:left"></label>${base}</section>
<section class="card sec"><h2>Qué va a pasar</h2>
${ok ? `<p style="font-size:15px;color:#1B2B2A">Se borran <b>${r.borrar} ${r.borrar === 1 ? 'día' : 'días'}</b> (del ${esc(fechaCorta(r.desde))} al ${esc(fechaCorta(r.hasta))}). Quedan <b>${r.quedan} ${r.quedan === 1 ? 'día' : 'días'}</b>.</p>
<p>Antes de borrar, la app guarda como punto de partida una foto de todo:</p>
<div class="rline"><span>Saldo de cada cliente (Cierre e Historial)</span><b>${DB.clients.length}</b></div>
<div class="rline"><span>Arqueo acumulado general</span><b>${L.fmtAR(r.arq.g)}</b></div>
<div class="rline"><span>Arqueo COB 1 / COB 2</span><b>${L.fmtAR(r.arq.c1)} / ${L.fmtAR(r.arq.c2)}</b></div>
<div class="rline"><span>Logística acumulada</span><b>${L.fmtAR(r.log)}</b></div>` : '<p>Con ese día no hay nada para borrar. Elegí un día más reciente.</p>'}</section>
${ok ? `<section class="card sec"><h2>Paso 2: respaldo</h2><p>Primero se hace un archivo con <b>todo</b> lo que hay ahora. Queda en Descargas y sirve para consultar lo viejo.</p>
<button class="btn ${S.arcOk ? 'ghost' : 'green'}" data-a="arc-resp" style="width:100%">${S.arcOk ? 'Respaldo hecho ✓ (hacer otro)' : 'HACER RESPALDO'}</button></section>
<section class="card sec"><h2>Paso 3: limpiar</h2><button class="btn red" data-a="arc-ir" ${S.arcOk ? '' : 'disabled'} style="width:100%;${S.arcOk ? '' : 'opacity:.4'}">LIMPIAR HISTORIAL</button></section>` : ''}
</div>` + nav();
  }
  function confirmArchivar() {
    if (!S.arcOk) return toast('Primero hacé el respaldo.', 3000);
    const corte = S.corte, r = L.resumenCorte(DB, corte);
    S.modal = { title: '¿El archivo está en Descargas?', ok: 'SÍ, LIMPIAR', danger: true,
      text: `Se borran <b>${r.borrar} días</b> anteriores al <b>${esc(fechaCorta(corte))}</b>. No se puede deshacer, salvo restaurando el archivo.<br><br>Confirmá que el respaldo está en Descargas.`,
      onOk: () => { L.limpiarAntes(DB, corte); S.arcOk = false; S.sub = null; if (persist()) toast('Listo. Datos desde el ' + fechaCorta(corte), 4000); } };
    render();
  }

  // ---------- PIN de titular, Limpiar, Deshacer ----------
  function requirePin(next) {
    if (Date.now() < S.titularUntil) return next();
    const ok = () => { S.titularUntil = Date.now() + 5 * 60 * 1000; return null; };
    if (!DB.config.titularHash) {
      S.modal = { title: 'PIN de titular', text: 'Primera vez: elegí un PIN de 4 números solo para el titular. Protege Limpiar, Clientes y Respaldo.', ok: 'GUARDAR', pin: 2,
        onPin: async (p) => { DB.config.titularHash = await hashPin('T' + p); persist(); return ok(); }, after: next };
    } else {
      S.modal = { title: 'PIN de titular', text: 'Escribí el PIN de titular.', ok: 'ENTRAR', pin: 1,
        onPin: async (p) => ((await hashPin('T' + p)) !== DB.config.titularHash ? 'PIN incorrecto.' : ok()), after: next };
    }
    render();
  }
  const PAGOS = ['compra', 'efectivo1', 'efectivo2', 'mercadopago', 'transferencia'];
  function confirmLimpiar() {
    const day = DB.allTxns[S.fecha] || {};
    const n = Object.keys(day).filter((k) => k !== '__meta__' && PAGOS.some((p) => day[k][p])).length;
    if (!n) return toast('No hay compras ni pagos cargados en ese día.', 3000);
    S.modal = { title: '¿Limpiar el día?', ok: 'LIMPIAR', danger: true,
      text: `Se borran las compras y pagos de <b>${n} clientes</b> del <b>${esc(fechaLarga(S.fecha))}</b>. Los ajustes no se tocan.<br><br>Antes se guarda una copia, por si querés deshacer.`,
      onOk: () => {
        const dd = DB.allTxns[S.fecha];
        DB.undo = { fecha: S.fecha, day: JSON.parse(JSON.stringify(dd)), at: new Date().toISOString(), por: S.name };
        for (const id of Object.keys(dd)) {
          if (id === '__meta__') continue;
          PAGOS.forEach((p) => { dd[id][p] = 0; });
          if (L.KEYS.every((k) => !dd[id][k])) delete dd[id];
        }
        dd.__meta__ = { editadoPor: S.name, actualizadoEl: new Date().toISOString(), guardado: false };
        if (persist()) toast('Día limpiado. Podés deshacerlo desde Más.', 4000);
      } };
    render();
  }
  function confirmUndo() {
    const u = DB.undo; if (!u) return;
    S.modal = { title: '¿Deshacer la limpieza?', ok: 'DESHACER', text: `Vuelve a cargar lo que había el <b>${esc(fechaLarga(u.fecha))}</b>. Lo que hayas cargado después en ese día se reemplaza.`,
      onOk: () => { DB.allTxns[u.fecha] = u.day; delete DB.undo; S.fecha = u.fecha; if (persist()) toast('Listo, se recuperó la carga.', 3000); } };
    render();
  }
  async function okModal() {
    const m = S.modal; if (!m) return;
    if (m.pin) {
      const p1 = document.getElementById('mpin').value;
      const p2 = m.pin === 2 ? document.getElementById('mpin2').value : null;
      let err = null;
      if (!/^\d{4}$/.test(p1)) err = 'Escribí 4 números.';
      else if (m.pin === 2 && p1 !== p2) err = 'Los dos PIN tienen que ser iguales.';
      else err = await m.onPin(p1);
      if (err) { const e = document.getElementById('merr'); if (e) e.textContent = err; return; }
      S.modal = null; render(); if (m.after) m.after();
      return;
    }
    S.modal = null; if (m.onOk) m.onOk(); render();
  }

  function guardarCliente() {
    const name = document.getElementById('c-name').value.trim();
    const saldo = L.parseAR(document.getElementById('c-saldo').value);
    const mail = document.getElementById('c-mail').value.trim();
    const tel = document.getElementById('c-tel').value.trim();
    if (!name) return toast('Falta el nombre.');
    if (isNaN(saldo)) return toast('El saldo inicial no es un número válido.', 3000);
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return toast('El mail no parece válido.', 3000);
    const dup = DB.clients.find((c) => norm(c.name) === norm(name) && c.id !== S.edit);
    if (dup) return toast('Ya hay un cliente con ese nombre.', 3000);
    if (S.edit === 'nuevo') DB.clients.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, saldoInicial: saldo, email: mail, telefono: tel, active: true });
    else { const c = DB.clients.find((x) => x.id === S.edit); Object.assign(c, { name, saldoInicial: saldo, email: mail, telefono: tel }); }
    if (persist()) { toast('Cliente guardado'); S.sub = 'clientes'; S.edit = null; render(); }
  }

  // ---------- Eventos ----------
  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a, v = b.dataset.v;
    if (a === 'key') { if (S.buf.length < 4) { S.buf += v; S.msg = ''; render(); if (S.buf.length === 4) pinDone(); } }
    else if (a === 'back') { S.buf = S.buf.slice(0, -1); render(); }
    else if (a === 'lock') { S.logged = false; S.buf = ''; S.stage = 'entrar'; S.msg = ''; render(); }
    else if (a === 'tab') { S.tab = v; S.sub = null; S.selCli = null; render(); }
    else if (a === 'dia') { S.fecha = shiftDay(S.fecha, Number(v)); S.open = null; render(); }
    else if (a === 'destrabar') requirePin(confirmDestrabar);
    else if (a === 'adestr') requirePin(() => confirmDestrabarRec('arqueo'));
    else if (a === 'ldestr') requirePin(() => confirmDestrabarRec('logistica'));
    else if (a === 'solo') { S.solo = !S.solo; render(); }
    else if (a === 'todos') { S.todos = !S.todos; try { localStorage.setItem('r284.todos', S.todos ? '1' : '0'); } catch (e) {} S.open = null; render(); }
    else if (a === 'open') { S.open = v; refreshList(); const el = document.querySelector('.card.open'); if (el) el.scrollIntoView({ block: 'nearest' }); }
    else if (a === 'close') { S.open = null; refreshList(); }
    else if (a === 'guardar') {
      const day = DB.allTxns[S.fecha];
      if (!day || Object.keys(day).filter((k) => k !== '__meta__').length === 0) return toast('No hay nada cargado en este día.');
      day.__meta__ = { editadoPor: S.name, actualizadoEl: new Date().toISOString(), guardado: true };
      S.open = null; if (persist()) { toast('Día guardado y bloqueado'); render(); preguntarRespaldo(); }
    }
    else if (a === 'respaldo') hacerRespaldo();
    else if (a === 'restaurar') { const f = document.getElementById('file'); if (f) { f.value = ''; f.click(); } }
    else if (a === 'm-no') { S.modal = null; render(); }
    else if (a === 'm-ok') okModal();
    else if (a === 'menu') {
      if (v === 'limpiar') requirePin(confirmLimpiar);
      else if (v === 'undo') confirmUndo();
      else if (v === 'historial') { S.sub = 'historial'; S.selCli = null; S.hq = ''; render(); }
      else if (v === 'clientes') requirePin(() => { S.sub = 'clientes'; S.hq = ''; render(); });
      else if (v === 'notas') { S.sub = 'notas'; render(); }
      else if (v === 'resumen') { S.sub = 'resumen'; S.rdia = S.fecha; render(); }
      else if (v === 'retiros') requirePin(() => { S.sub = 'retiros'; S.rmes = today().slice(0, 7); render(); });
      else if (v === 'pasar') { S.sub = 'pasar'; render(); }
      else if (v === 'archivar') requirePin(() => { S.sub = 'archivar'; S.arcOk = false; S.corte = shiftDay(today(), -90); render(); });
      else if (v === 'respaldo') requirePin(() => { S.sub = 'respaldo'; render(); });
    }
    else if (a === 'subback') { if (S.sub === 'cform') { S.sub = 'clientes'; S.edit = null; } else if (S.sub === 'historial' && S.selCli) S.selCli = null; else S.sub = null; render(); }
    else if (a === 'hsel') { S.selCli = v; render(); }
    else if (a === 'cnew') { S.edit = 'nuevo'; S.sub = 'cform'; render(); }
    else if (a === 'cedit') { S.edit = v; S.sub = 'cform'; render(); }
    else if (a === 'cinact') { S.verInact = !S.verInact; render(); }
    else if (a === 'csave') guardarCliente();
    else if (a === 'ctoggle') { const c = DB.clients.find((x) => x.id === S.edit); if (c) { c.active = c.active === false; if (persist()) { toast(c.active ? 'Cliente activado' : 'Cliente desactivado'); S.sub = 'clientes'; S.edit = null; render(); } } }
    else if (a === 'rdia') { S.rdia = shiftDay(S.rdia || S.fecha, Number(v)); render(); }
    else if (a === 'rmes') { const [y, m] = (S.rmes || today().slice(0, 7)).split('-').map(Number); const d = new Date(y, m - 1 + Number(v), 1); S.rmes = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); render(); }
    else if (a === 'r-desc') bajar('resumen-' + S.rdia + '.txt', new Blob([L.textoResumen(DB, S.rdia)], { type: 'text/plain' }));
    else if (a === 'r-comp') compartirTexto(L.textoResumen(DB, S.rdia));
    else if (a === 'p-pin') requirePin(() => render());
    else if (a === 'p-enviar') enviarCierre();
    else if (a === 'p-saldos') enviarSaldos();
    else if (a === 'arc-resp') { hacerRespaldo(); S.arcOk = true; render(); }
    else if (a === 'arc-ir') confirmArchivar();
    else if (a === 'asave') guardarArqueo();
    else if (a === 'lsave') guardarLogistica();
    else if (a === 'nsave') { const el = document.getElementById('n-text'); const tx = el.value.trim(); if (!tx) return toast('Escribí la nota primero.'); DB.notas.push({ fecha: today(), texto: tx, usuario: S.name }); if (persist()) { toast('Nota guardada'); render(); } }
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'name') { S.name = t.value; localStorage.setItem(NAMEKEY, S.name); }
    else if (t.id === 'q') { S.q = t.value; refreshList(); }
    else if (t.dataset && t.dataset.arq) {
      if (t.dataset.arq === 'gen') t.dataset.touched = '1';
      else {
        const gen = document.getElementById('ar-gen');
        if (gen && !gen.dataset.touched) { const v = arVals(); const n = L.r2(v.depositado1 + v.depositado2 - v.retiroNF); gen.value = n ? L.fmtAR(n) : ''; }
      }
      arCalc();
    }
    else if (t.dataset && t.dataset.lg) lgCalc();
    else if (t.id === 'hq') { S.hq = t.value; const l = document.getElementById('list2'); if (l) l.innerHTML = S.sub === 'clientes' ? cliListHTML() : histListHTML(); }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'file' && t.files && t.files[0]) return leerArchivo(t.files[0]);
    if (t.dataset && t.dataset.opt) { S[t.dataset.opt] = t.checked; return; }
    if (t.id === 'file-c' && t.files && t.files[0]) return leerCierre(t.files[0]);
    if (t.id === 'file-s' && t.files && t.files[0]) return leerSaldos(t.files[0]);
    if (t.id === 'arc-corte') { if (/^\d{4}-\d{2}-\d{2}$/.test(t.value)) { S.corte = t.value; render(); } return; }
    if (t.dataset && (t.dataset.arq || t.dataset.lg)) { const n = L.parseAR(t.value); if (isNaN(n)) { toast('Ese número no es válido.'); } else { t.value = n ? L.fmtAR(n) : ''; t.classList.toggle('has', !!n); } return; }
    if (t.dataset && t.dataset.k) {
      if (diaBloqueado(S.fecha)) return toast('El día está guardado. Destrabalo con el PIN de titular.', 3500);
      const n = L.parseAR(t.value);
      const t0 = getT(S.fecha, t.dataset.id);
      if (isNaN(n)) { toast('Ese número no es válido.'); t.value = t0 && t0[t.dataset.k] ? L.fmtAR(t0[t.dataset.k]) : ''; return; }
      setVal(S.fecha, t.dataset.id, t.dataset.k, n);
      t.value = n ? L.fmtAR(n) : '';
      t.classList.toggle('has', !!n);
      const antes = L.saldoHasta(DB, t.dataset.id, S.fecha, false);
      const nuevo = L.r2(antes + L.mov(getT(S.fecha, t.dataset.id)));
      const el = document.getElementById('new-' + t.dataset.id);
      if (el) { el.textContent = L.fmtAR(nuevo); el.className = 'b ' + cls(nuevo); }
      const tt = dayTotals();
      const c1 = document.getElementById('tot-compras'), c2 = document.getElementById('tot-cobrado');
      if (c1) c1.textContent = L.fmtAR(tt.compras);
      if (c2) c2.textContent = L.fmtAR(cobrado(tt));
    }
  });

  // Si la app quedó abierta de un día para el otro, pasa sola al día de hoy.
  hoyVisto = today();
  function revisarDia() {
    const h = today(); if (h === hoyVisto) return;
    if (S.fecha === hoyVisto) S.fecha = h;
    hoyVisto = h; S.open = null; if (!S.modal) render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarDia(); });
  window.addEventListener('focus', revisarDia);
  setInterval(revisarDia, 30000);

  render();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
