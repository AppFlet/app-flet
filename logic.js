'use strict';
// Lógica de cuentas (sin pantalla). Se puede probar sola.
(function (root) {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // "1.234,56" -> 1234.56
  function parseAR(s) {
    if (typeof s === 'number') return r2(s);
    let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (!t) return 0;
    let neg = false;
    if (t[0] === '-') { neg = true; t = t.slice(1); }
    t = t.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    if (isNaN(n)) return NaN;
    return r2(neg ? -n : n);
  }

  // 1234.56 -> "1.234,56"
  function fmtAR(n) {
    const v = r2(n);
    const neg = v < 0;
    const [ent, dec] = Math.abs(v).toFixed(2).split('.');
    return (neg ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  }

  const KEYS = ['compra', 'efectivo1', 'efectivo2', 'mercadopago', 'transferencia', 'ajuste'];

  // Cuánto cambia el saldo en un día: compra - pagos + ajuste
  function mov(t) {
    if (!t) return 0;
    return r2((t.compra || 0) - (t.efectivo1 || 0) - (t.efectivo2 || 0) -
      (t.mercadopago || 0) - (t.transferencia || 0) + (t.ajuste || 0));
  }

  // Saldo de un cliente hasta una fecha (incluida o no)
  function saldoHasta(db, cid, fecha, incluir) {
    const c = db.clients.find((x) => x.id === cid);
    let s = c ? Number(c.saldoInicial) || 0 : 0;
    for (const d of Object.keys(db.allTxns)) {
      if (d > fecha || (!incluir && d === fecha)) continue;
      s += mov(db.allTxns[d][cid]);
    }
    return r2(s);
  }

  function totalesDia(db, fecha) {
    const out = { compras: 0, efectivo1: 0, efectivo2: 0, mercadopago: 0, transferencia: 0, ajuste: 0 };
    const d = db.allTxns[fecha] || {};
    for (const cid of Object.keys(d)) {
      if (cid === '__meta__') continue;
      for (const k of KEYS) out[k === 'compra' ? 'compras' : k] += d[cid][k] || 0;
    }
    for (const k of Object.keys(out)) out[k] = r2(out[k]);
    return out;
  }

  // ---- Arqueo ----
  // dg = efectivo cobrado - depositado general - retiro NF ; d1/d2 = efectivo del cobrador - lo que depositó
  // (positivo = falta depositar, negativo = sobra)
  function arqueoDia(db, f, rec) {
    rec = rec || (db.arqueo && db.arqueo[f]) || {};
    const t = totalesDia(db, f);
    return {
      t,
      dg: r2(t.efectivo1 + t.efectivo2 - (rec.depositadoGeneral || 0) - (rec.retiroNF || 0)),
      d1: r2(t.efectivo1 - (rec.depositado1 || 0)),
      d2: r2(t.efectivo2 - (rec.depositado2 || 0))
    };
  }
  function arqueoAcum(db, f, incluir) {
    const b = db.baseSemana || {};
    const out = { g: Number(b.arqueo) || 0, c1: Number(b.arqueo1) || 0, c2: Number(b.arqueo2) || 0 };
    for (const d of Object.keys(db.arqueo || {})) {
      if (d > f || (!incluir && d === f)) continue;
      const x = arqueoDia(db, d);
      out.g += x.dg; out.c1 += x.d1; out.c2 += x.d2;
    }
    return { g: r2(out.g), c1: r2(out.c1), c2: r2(out.c2) };
  }

  // ---- Logística ----
  // dif = (efectivo + MP + transferencia de ayer + corrección) - pagos afectados
  function difLog(rec) {
    rec = rec || {};
    return r2((rec.efectivoAyer || 0) + (rec.mercadopagoAyer || 0) + (rec.transferenciaAyer || 0) + (rec.correccion || 0) - (rec.pagosAfectado || 0));
  }
  function logAcum(db, f, incluir) {
    let s = Number((db.baseSemana || {}).logistica) || 0;
    for (const d of Object.keys(db.logisticaTxns || {})) {
      if (d > f || (!incluir && d === f)) continue;
      s += difLog(db.logisticaTxns[d]);
    }
    return r2(s);
  }
  const prevDate = (keys, f) => keys.filter((d) => d < f).sort().pop() || null;
  function sugLogistica(db, f) {
    const pt = prevDate(Object.keys(db.allTxns || {}).filter((d) => Object.keys(db.allTxns[d]).some((k) => k !== '__meta__')), f);
    const pa = prevDate(Object.keys(db.arqueo || {}), f);
    const t = pt ? totalesDia(db, pt) : { mercadopago: 0, transferencia: 0 };
    return { efectivoAyer: pa ? r2(db.arqueo[pa].depositadoGeneral || 0) : 0, mercadopagoAyer: t.mercadopago, transferenciaAyer: t.transferencia, fechaCobro: pt, fechaArqueo: pa };
  }

  // ---- Limpieza de historial viejo ----
  // Todo lo anterior al día de corte se borra. Antes se calcula la "foto" (saldos y acumulados)
  // y se guarda como punto de partida; recién después se borran los días viejos.
  function resumenCorte(db, corte) {
    const antes = (o) => Object.keys(o || {}).filter((d) => d < corte).sort();
    const t = antes(db.allTxns), a = antes(db.arqueo), l = antes(db.logisticaTxns);
    const todos = Array.from(new Set(t.concat(a, l))).sort();
    const quedan = Array.from(new Set(Object.keys(db.allTxns || {}).concat(Object.keys(db.arqueo || {}), Object.keys(db.logisticaTxns || {})).filter((d) => d >= corte))).length;
    return { borrar: todos.length, desde: todos[0] || null, hasta: todos[todos.length - 1] || null, quedan,
      arq: arqueoAcum(db, corte, false), log: logAcum(db, corte, false) };
  }
  function limpiarAntes(db, corte) {
    const saldos = db.clients.map((c) => [c, saldoHasta(db, c.id, corte, false)]);
    const ar = arqueoAcum(db, corte, false), lg = logAcum(db, corte, false);
    saldos.forEach(([c, s]) => { c.saldoInicial = s; c.saldoDesde = corte; });
    db.baseSemana = Object.assign({}, db.baseSemana, { desde: corte, arqueo: ar.g, arqueo1: ar.c1, arqueo2: ar.c2, logistica: lg, cerradaEl: new Date().toISOString() });
    for (const k of ['allTxns', 'arqueo', 'logisticaTxns']) for (const d of Object.keys(db[k] || {})) if (d < corte) delete db[k][d];
    if (db.undo && db.undo.fecha < corte) delete db.undo;
    return db;
  }

  // ---- Pasar datos entre celulares ----
  const tieneDatos = (t) => !!t && KEYS.some((k) => (t[k] || 0) !== 0);
  const iguales = (a, b) => KEYS.every((k) => r2((a || {})[k] || 0) === r2((b || {})[k] || 0));
  const IGUALES_AR = ['depositadoGeneral', 'depositado1', 'depositado2', 'retiroNF'];
  const IGUALES_LG = ['efectivoAyer', 'mercadopagoAyer', 'transferenciaAyer', 'pagosAfectado', 'correccion'];
  const mismo = (a, b, ks) => ks.every((k) => r2((a || {})[k] || 0) === r2((b || {})[k] || 0));
  const algo = (o, ks) => !!o && ks.some((k) => (o[k] || 0) !== 0);

  // Lo que manda el empleado: lo cargado ese día.
  function armarCierre(db, f, de) {
    const dia = {}, nombres = {};
    const d = (db.allTxns || {})[f] || {};
    for (const cid of Object.keys(d)) {
      if (cid === '__meta__' || !tieneDatos(d[cid])) continue;
      dia[cid] = {}; KEYS.forEach((k) => { dia[cid][k] = d[cid][k] || 0; });
      const c = db.clients.find((x) => x.id === cid); nombres[cid] = c ? c.name : cid;
    }
    const ar = (db.arqueo || {})[f], lg = (db.logisticaTxns || {})[f];
    return { tipo: 'cierre-r284', version: 1, fecha: f, de: de || '', creadoEl: new Date().toISOString(), dia, nombres,
      arqueo: algo(ar, IGUALES_AR) ? ar : null, logistica: algo(lg, IGUALES_LG) ? lg : null };
  }

  // Suma el cierre del empleado a los datos del titular. Si ya había algo distinto, manda el titular.
  function sumarCierre(db, c, aplicar) {
    const f = c.fecha, r = { agregados: [], iguales: [], conflictos: [], desconocidos: [], arqueo: '', logistica: '' };
    const dia = (db.allTxns || {})[f] || {};
    for (const cid of Object.keys(c.dia || {})) {
      const nom = (c.nombres || {})[cid] || cid;
      if (!db.clients.some((x) => x.id === cid)) { r.desconocidos.push(nom); continue; }
      const ya = dia[cid];
      if (!tieneDatos(ya)) { r.agregados.push(nom); if (aplicar) { if (!db.allTxns[f]) db.allTxns[f] = {}; db.allTxns[f][cid] = KEYS.reduce((o, k) => { o[k] = c.dia[cid][k] || 0; return o; }, {}); } }
      else if (iguales(ya, c.dia[cid])) r.iguales.push(nom);
      else r.conflictos.push(nom);
    }
    if (aplicar && r.agregados.length) { const m = db.allTxns[f].__meta__; db.allTxns[f].__meta__ = m || { editadoPor: c.de, actualizadoEl: new Date().toISOString(), guardado: false }; }
    const trat = (k, ks, nombre) => {
      const nuevo = c[nombre === 'arqueo' ? 'arqueo' : 'logistica']; if (!nuevo) return;
      const ya = (db[k] || {})[f];
      if (!algo(ya, ks)) { r[nombre] = 'agregado'; if (aplicar) db[k][f] = Object.assign({}, nuevo, { editadoPor: nuevo.editadoPor || c.de, guardado: false }); }
      else if (mismo(ya, nuevo, ks)) r[nombre] = 'igual'; else r[nombre] = 'conflicto';
    };
    trat('arqueo', IGUALES_AR, 'arqueo'); trat('logisticaTxns', IGUALES_LG, 'logistica');
    return r;
  }

  // Cargas de este celular que no están en un archivo del titular (para no perderlas al recibir saldos)
  function cargasSinEnviar(db, o) {
    let n = 0;
    for (const f of Object.keys(db.allTxns || {})) for (const cid of Object.keys(db.allTxns[f])) {
      if (cid === '__meta__' || !tieneDatos(db.allTxns[f][cid])) continue;
      const otro = ((o.allTxns || {})[f] || {})[cid];
      if (!iguales(db.allTxns[f][cid], otro)) n++;
    }
    return n;
  }

  // ---- Planilla de Excel (mismas hojas y columnas que la app anterior) ----
  function filasExcel(db) {
    const nom = (id) => { const c = db.clients.find((x) => x.id === id); return c ? c.name : id; };
    const orden = db.clients.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    const cli = [['Cliente', 'Saldo actual', 'COMPRA ', 'A COBRAR', 'Efvo. Cobr. 1', 'MP', 'Efvo. Cobr. 2', 'AJUSTE', 'RETIRO', 'SALDO FINAL']];
    orden.forEach((c, i) => {
      const r = i + 2, sa = saldoHasta(db, c.id, '9999-12-31', true);
      cli.push([c.name, sa, null, { f: 'B' + r + '+C' + r, v: sa }, null, null, null, null, null, { f: 'D' + r + '-E' + r + '-F' + r + '-G' + r + '-H' + r + '-I' + r, v: sa }]);
    });
    const hist = [['Fecha', 'Cliente', 'Saldo anterior', 'Compra', 'Efvo Cobrador 1', 'Efvo Cobrador 2', 'MercadoPago', 'Transferencia', 'Ajuste', 'Saldo final']];
    const corr = {}; db.clients.forEach((c) => { corr[c.id] = Number(c.saldoInicial) || 0; });
    for (const d of Object.keys(db.allTxns || {}).sort()) {
      const dia = db.allTxns[d], ids = Object.keys(dia).filter((k) => k !== '__meta__').sort((a, b) => String(nom(a)).localeCompare(String(nom(b)), 'es'));
      for (const cid of ids) {
        const t = dia[cid], ant = r2(corr[cid] || 0); corr[cid] = r2(ant + mov(t));
        if (tieneDatos(t)) hist.push([d, nom(cid), ant, t.compra || 0, t.efectivo1 || 0, t.efectivo2 || 0, t.mercadopago || 0, t.transferencia || 0, t.ajuste || 0, corr[cid]]);
      }
    }
    const arq = [['Fecha', 'Depositado general', 'Depósito cobrador 1', 'Depósito cobrador 2', 'Retiro NF']];
    for (const d of Object.keys(db.arqueo || {}).sort()) { const r = db.arqueo[d]; arq.push([d, r.depositadoGeneral || 0, r.depositado1 || 0, r.depositado2 || 0, r.retiroNF || 0]); }
    const log = [['Fecha', 'Efectivo (ayer)', 'MercadoPago (ayer)', 'Transferencia (ayer)', 'Total', 'Pagos afectado LLSSA', 'Diferencia', 'Corrección', 'Acumulado']];
    let ac = Number((db.baseSemana || {}).logistica) || 0;
    for (const d of Object.keys(db.logisticaTxns || {}).sort()) {
      const r = db.logisticaTxns[d]; if (!algo(r, IGUALES_LG)) continue;
      const tot = r2((r.efectivoAyer || 0) + (r.mercadopagoAyer || 0) + (r.transferenciaAyer || 0)), dif = r2(tot - (r.pagosAfectado || 0));
      ac = r2(ac + dif + (r.correccion || 0));
      log.push([d, r.efectivoAyer || 0, r.mercadopagoAyer || 0, r.transferenciaAyer || 0, tot, r.pagosAfectado || 0, dif, r.correccion || 0, ac]);
    }
    return [{ name: 'Clientes', rows: cli }, { name: 'Historial clientes', rows: hist }, { name: 'Arqueo', rows: arq }, { name: 'Logística', rows: log }];
  }

  // El empleado recibe los datos del titular. El titular manda en los días ya guardados;
  // lo que el empleado cargó en días sin guardar (o que el titular no tiene) se conserva.
  function recibirDatos(db, o, aplicar) {
    const cp = (x) => JSON.parse(JSON.stringify(x || {}));
    const nuevo = { clients: cp(o.clients).length ? JSON.parse(JSON.stringify(o.clients)) : [], allTxns: cp(o.allTxns), arqueo: cp(o.arqueo), logisticaTxns: cp(o.logisticaTxns),
      baseSemana: o.baseSemana ? cp(o.baseSemana) : cp(db.baseSemana), notas: Array.isArray(o.notas) ? cp(o.notas) : [] };
    const desde = (nuevo.baseSemana && nuevo.baseSemana.desde) || '';
    const abierto = (m) => !m || m.guardado === false;       // día sin guardar
    const r = { conservadas: 0, reemplazadas: 0 };
    for (const f of Object.keys(db.allTxns || {})) {
      if (desde && f < desde) continue;
      const mio = db.allTxns[f], suyo = nuevo.allTxns[f];
      for (const cid of Object.keys(mio)) {
        if (cid === '__meta__' || !tieneDatos(mio[cid])) continue;
        const s = suyo && suyo[cid];
        if (suyo && !abierto(suyo.__meta__)) { if (!iguales(mio[cid], s)) r.reemplazadas++; continue; }
        if (!tieneDatos(s)) { if (!nuevo.allTxns[f]) nuevo.allTxns[f] = {}; nuevo.allTxns[f][cid] = JSON.parse(JSON.stringify(mio[cid])); if (!nuevo.allTxns[f].__meta__ && mio.__meta__) nuevo.allTxns[f].__meta__ = JSON.parse(JSON.stringify(mio.__meta__)); r.conservadas++; }
      }
    }
    for (const [k, ks] of [['arqueo', IGUALES_AR], ['logisticaTxns', IGUALES_LG]]) for (const f of Object.keys(db[k] || {})) {
      if (desde && f < desde) continue;
      const mio = db[k][f], suyo = nuevo[k][f];
      if (!algo(mio, ks)) continue;
      if (!algo(suyo, ks)) { nuevo[k][f] = JSON.parse(JSON.stringify(mio)); r.conservadas++; }
      else if (!mismo(mio, suyo, ks) && suyo.guardado !== false) r.reemplazadas++;
    }
    if (aplicar) { db.clients = nuevo.clients; db.allTxns = nuevo.allTxns; db.arqueo = nuevo.arqueo; db.logisticaTxns = nuevo.logisticaTxns; db.baseSemana = nuevo.baseSemana;
      const vistos = new Set(nuevo.notas.map((n) => n.fecha + '|' + n.texto + '|' + n.usuario)); (db.notas || []).forEach((n) => { if (!vistos.has(n.fecha + '|' + n.texto + '|' + n.usuario)) nuevo.notas.push(n); }); db.notas = nuevo.notas; }
    return r;
  }

  // ---- Resumen del día y Retiros del mes ----
  const fmtD = (f) => f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4);
  const mon = (n) => '$' + fmtAR(n);
  function textoResumen(db, f) {
    const t = totalesDia(db, f), a = arqueoDia(db, f), rec = (db.arqueo || {})[f] || {}, lg = (db.logisticaTxns || {})[f] || {};
    const cob = r2(t.efectivo1 + t.efectivo2 + t.mercadopago + t.transferencia);
    const ayer = r2((lg.efectivoAyer || 0) + (lg.mercadopagoAyer || 0) + (lg.transferenciaAyer || 0)), af = r2(lg.pagosAfectado || 0);
    const ac = arqueoAcum(db, f, true), la = logAcum(db, f, true);
    const L_ = ['RESUMEN DEL DÍA — ' + fmtD(f), '',
      'Compras: ' + mon(t.compras), 'Cobranzas general: ' + mon(cob), 'Total recaudado — Pago 1: ' + mon(t.efectivo1), 'Total recaudado — Pago 2: ' + mon(t.efectivo2),
      'Total recaudado — MercadoPago: ' + mon(t.mercadopago), 'Transferencias: ' + mon(t.transferencia), '',
      'ARQUEO', 'Depositado: ' + mon(rec.depositadoGeneral || 0), 'Diferencia: ' + mon(a.dg),
      'Cobrador 1 — Recaudado: ' + mon(t.efectivo1), 'Cobrador 1 — Depositado: ' + mon(rec.depositado1 || 0), 'Cobrador 1 — Diferencia: ' + mon(a.d1),
      'Cobrador 2 — Recaudado: ' + mon(t.efectivo2), 'Cobrador 2 — Depositado: ' + mon(rec.depositado2 || 0), 'Cobrador 2 — Diferencia: ' + mon(a.d2),
      'Retiro no facturado: ' + mon(rec.retiroNF || 0), 'Diferencia acumulada: ' + mon(ac.g), '',
      'LOGÍSTICA', 'Rendido ayer: ' + mon(ayer), 'Afectado hoy: ' + mon(af), 'Diferencia: ' + mon(r2(ayer - af))];
    if (lg.correccion) L_.push('Corrección: ' + mon(lg.correccion));
    L_.push('Diferencia acumulada: ' + mon(la));
    return L_.join('\n');
  }
  const normN = (s) => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const RETIRO_CLIENTES = ['ROKE', 'NICOLAS'];
  // Retiros de un mes ('2026-10'): retiro no facturado del Arqueo + ajustes cargados en ROKE y NICOLAS.
  function retirosMes(db, ym) {
    const ids = {}; db.clients.forEach((c) => { if (RETIRO_CLIENTES.includes(normN(c.name))) ids[c.id] = c.name; });
    const dias = new Set(Object.keys(db.arqueo || {}).concat(Object.keys(db.allTxns || {})).filter((d) => d.slice(0, 7) === ym));
    const filas = []; let total = 0;
    Array.from(dias).sort().forEach((d) => {
      const nf = r2(((db.arqueo || {})[d] || {}).retiroNF || 0); const aj = [];
      for (const cid of Object.keys(ids)) { const x = r2((((db.allTxns || {})[d] || {})[cid] || {}).ajuste || 0); if (x) aj.push({ nombre: ids[cid], monto: x }); }
      const tot = r2(nf + aj.reduce((a, b) => a + b.monto, 0));
      if (nf || aj.length) { filas.push({ fecha: d, nf, ajustes: aj, total: tot }); total = r2(total + tot); }
    });
    return { total, filas };
  }

  function diaAnterior(f) { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Día por día: lo cobrado en efectivo, lo depositado (general + retiro NF), la diferencia y el acumulado general.
  function detalleArqueo(db) {
    let ac = Number((db.baseSemana || {}).arqueo) || 0;
    return Object.keys(db.arqueo || {}).sort().map((f) => {
      const x = arqueoDia(db, f), r = db.arqueo[f];
      ac = r2(ac + x.dg);
      return { fecha: f, cobrado: r2(x.t.efectivo1 + x.t.efectivo2), depositado: r2((r.depositadoGeneral || 0) + (r.retiroNF || 0)), dif: x.dg, acum: ac };
    });
  }

  const api = { r2, parseAR, fmtAR, KEYS, mov, saldoHasta, totalesDia, arqueoDia, arqueoAcum, difLog, logAcum, sugLogistica, resumenCorte, limpiarAntes, armarCierre, sumarCierre, cargasSinEnviar, filasExcel, recibirDatos, textoResumen, retirosMes, diaAnterior, detalleArqueo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.R284 = api;
})(typeof window !== 'undefined' ? window : globalThis);
