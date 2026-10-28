(function () {
  const Q = window.Q;
  const { QuoinError, u16, u32 } = Q;
  const FREE = 0xFFFFFFFF, END = 0xFFFFFFFE, FATSECT = 0xFFFFFFFD, NOSTREAM = 0xFFFFFFFF;
  const SIG = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

  function isCfb(b) { return b.length >= 8 && SIG.every((x, i) => b[i] === x); }

  function readCfb(buf, maxSectors) {
    maxSectors = maxSectors || (1 << 20);
    if (!isCfb(buf) || buf.length < 512) throw new QuoinError('cfb.header', 'The VBA project could not be read.', 'vbaProject.bin');
    const major = u16(buf, 26), shift = u16(buf, 30), miniShift = u16(buf, 32);
    if (u16(buf, 28) !== 0xFFFE || !((major === 3 && shift === 9) || (major === 4 && shift === 12)) || miniShift !== 6) throw new QuoinError('cfb.header', 'The VBA project could not be read.', 'vbaProject.bin');
    const ss = 1 << shift;
    const nSectors = Math.floor((buf.length - ss) / ss) + 1;
    if (nSectors > maxSectors) throw new QuoinError('cfb.size', 'The VBA project is too large.', 'vbaProject.bin');
    const dirStart = u32(buf, 48), cutoff = u32(buf, 56), miniFatStart = u32(buf, 60), difatStart = u32(buf, 68);
    const off = s => (s + 1) * ss;
    const okSector = s => s < nSectors && off(s) + ss <= buf.length + ss;

    const fatSectors = [];
    for (let i = 0; i < 109; i++) { const s = u32(buf, 76 + i * 4); if (s !== FREE && s !== END) fatSectors.push(s); }
    let d = difatStart;
    const seenDifat = new Set();
    while (d !== END && d !== FREE) {
      if (seenDifat.has(d) || !okSector(d)) throw new QuoinError('cfb.chain', 'The VBA project has a damaged sector chain.', 'vbaProject.bin');
      seenDifat.add(d);
      const o = off(d);
      for (let i = 0; i < ss / 4 - 1; i++) { const s = u32(buf, o + i * 4); if (s !== FREE && s !== END) fatSectors.push(s); }
      d = u32(buf, o + ss - 4);
    }
    const fat = [];
    fatSectors.forEach(s => {
      if (!okSector(s)) throw new QuoinError('cfb.chain', 'The VBA project has a damaged sector chain.', 'vbaProject.bin');
      const o = off(s);
      for (let i = 0; i < ss / 4; i++) fat.push(o + i * 4 + 4 <= buf.length ? u32(buf, o + i * 4) : FREE);
    });

    function chain(start, table, limit) {
      const out = [];
      const seen = new Set();
      let s = start;
      while (s !== END && s !== FREE) {
        if (s >= table.length || seen.has(s) || out.length > limit) throw new QuoinError('cfb.chain', 'The VBA project has a damaged sector chain.', 'vbaProject.bin');
        seen.add(s);
        out.push(s);
        s = table[s];
      }
      return out;
    }

    function readRegular(start, size) {
      const secs = chain(start, fat, nSectors);
      const out = new Uint8Array(size == null ? secs.length * ss : size);
      let p = 0;
      for (const s of secs) {
        if (p >= out.length) break;
        const o = off(s);
        const n = Math.min(ss, out.length - p, Math.max(0, buf.length - o));
        out.set(buf.subarray(o, o + n), p);
        p += n;
      }
      return out;
    }

    const dirBytes = readRegular(dirStart, null);
    const dirs = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const nameLen = u16(dirBytes, o + 64);
      let name = '';
      for (let i = 0; i < Math.max(0, nameLen / 2 - 1) && i < 32; i++) name += String.fromCharCode(u16(dirBytes, o + i * 2));
      dirs.push({
        name,
        type: dirBytes[o + 66],
        left: u32(dirBytes, o + 68),
        right: u32(dirBytes, o + 72),
        child: u32(dirBytes, o + 76),
        clsid: dirBytes.slice(o + 80, o + 96),
        state: u32(dirBytes, o + 96),
        created: dirBytes.slice(o + 100, o + 108),
        modified: dirBytes.slice(o + 108, o + 116),
        start: u32(dirBytes, o + 116),
        size: major === 3 ? u32(dirBytes, o + 120) : u32(dirBytes, o + 120) + u32(dirBytes, o + 124) * 0x100000000
      });
    }
    if (!dirs.length || dirs[0].type !== 5) throw new QuoinError('cfb.dir', 'The VBA project directory is damaged.', 'vbaProject.bin');
    const root = dirs[0];
    const miniStream = root.start === END ? new Uint8Array(0) : readRegular(root.start, root.size);
    const miniFatBytes = miniFatStart === END || miniFatStart === FREE ? new Uint8Array(0) : readRegular(miniFatStart, null);
    const miniFat = [];
    for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(u32(miniFatBytes, i));

    function readMini(start, size) {
      const secs = chain(start, miniFat, miniFat.length + 1);
      const out = new Uint8Array(size);
      let p = 0;
      for (const s of secs) {
        if (p >= size) break;
        const o = s * 64;
        const n = Math.min(64, size - p);
        out.set(miniStream.subarray(o, o + n), p);
        p += n;
      }
      return out;
    }

    const entries = [];
    const visited = new Set();
    function walk(id, prefix) {
      if (id === NOSTREAM) return;
      if (id >= dirs.length || visited.has(id)) throw new QuoinError('cfb.dir', 'The VBA project directory is damaged.', 'vbaProject.bin');
      visited.add(id);
      const e = dirs[id];
      walk(e.left, prefix);
      const path = prefix ? prefix + '/' + e.name : e.name;
      if (e.type === 2) {
        const data = e.size === 0 ? new Uint8Array(0) : (e.size < cutoff ? readMini(e.start, e.size) : readRegular(e.start, e.size));
        entries.push({ path, name: e.name, type: 2, data, clsid: e.clsid, state: e.state, created: e.created, modified: e.modified });
      } else if (e.type === 1) {
        entries.push({ path, name: e.name, type: 1, clsid: e.clsid, state: e.state, created: e.created, modified: e.modified });
        walk(e.child, path);
      }
      walk(e.right, prefix);
    }
    walk(root.child, '');
    return { root: { clsid: root.clsid, state: root.state, created: root.created, modified: root.modified }, entries, major };
  }

  function cfbCompare(a, b) {
    if (a.length !== b.length) return a.length - b.length;
    const A = a.toUpperCase(), B = b.toUpperCase();
    for (let i = 0; i < A.length; i++) { const d = A.charCodeAt(i) - B.charCodeAt(i); if (d) return d; }
    return 0;
  }

  function writeCfb(model) {
    const SS = 512;
    const nodes = [{ name: 'Root Entry', type: 5, children: [], clsid: model.root.clsid, state: model.root.state, created: model.root.created, modified: model.root.modified }];
    const byPath = new Map([['', nodes[0]]]);
    function ensure(path) {
      if (byPath.has(path)) return byPath.get(path);
      const i = path.lastIndexOf('/');
      const parent = ensure(i < 0 ? '' : path.slice(0, i));
      const n = { name: path.slice(i + 1), type: 1, children: [] };
      parent.children.push(n);
      byPath.set(path, n);
      return n;
    }
    model.entries.forEach(e => {
      const i = e.path.lastIndexOf('/');
      const parent = ensure(i < 0 ? '' : e.path.slice(0, i));
      let n = byPath.get(e.path);
      if (!n) { n = { name: e.name || e.path.slice(i + 1), type: e.type, children: [] }; parent.children.push(n); byPath.set(e.path, n); }
      n.type = e.type;
      n.data = e.data;
      n.clsid = e.clsid; n.state = e.state; n.created = e.created; n.modified = e.modified;
    });

    const order = [nodes[0]];
    const queue = [nodes[0]];
    while (queue.length) {
      const n = queue.shift();
      n.children.sort((a, b) => cfbCompare(a.name, b.name));
      n.children.forEach(c => { order.push(c); queue.push(c); });
    }
    order.forEach((n, i) => { n.id = i; n.left = NOSTREAM; n.right = NOSTREAM; n.child = NOSTREAM; n.color = 1; });

    order.forEach(n => {
      if (!n.children.length) return;
      const kids = n.children;
      const depthOf = new Map();
      function build(lo, hi, depth) {
        if (lo > hi) return null;
        const mid = (lo + hi) >> 1;
        const node = kids[mid];
        depthOf.set(node, depth);
        const l = build(lo, mid - 1, depth + 1), r = build(mid + 1, hi, depth + 1);
        node.left = l ? l.id : NOSTREAM;
        node.right = r ? r.id : NOSTREAM;
        return node;
      }
      const top = build(0, kids.length - 1, 0);
      n.child = top.id;
      let maxD = 0;
      depthOf.forEach(d => { if (d > maxD) maxD = d; });
      const atMax = [...depthOf.values()].filter(d => d === maxD).length;
      if (atMax < (1 << maxD)) depthOf.forEach((d, node) => { if (d === maxD && maxD > 0) node.color = 0; });
    });

    const mini = [];
    const miniFat = [];
    let miniLen = 0;
    const regular = [];
    order.forEach(n => {
      if (n.type !== 2) return;
      const len = n.data.length;
      if (len === 0) { n.start = END; return; }
      if (len < 4096) {
        const secs = Math.ceil(len / 64);
        n.start = miniLen / 64;
        for (let i = 0; i < secs; i++) miniFat.push(i === secs - 1 ? END : n.start + i + 1);
        mini.push({ data: n.data, at: miniLen });
        miniLen += secs * 64;
      } else regular.push(n);
    });

    const dirSecs = Math.ceil(order.length * 128 / SS);
    const miniFatSecs = Math.ceil(miniFat.length * 4 / SS);
    const miniStreamSecs = Math.ceil(miniLen / SS);
    const regSecs = regular.reduce((a, n) => a + Math.ceil(n.data.length / SS), 0);
    let fatSecs = 1;
    for (;;) {
      const total = fatSecs + dirSecs + miniFatSecs + miniStreamSecs + regSecs;
      const need = Math.ceil(total * 4 / SS);
      if (need <= fatSecs) break;
      fatSecs = need;
    }
    if (fatSecs > 109) throw new QuoinError('cfb.size', 'The VBA project is too large to write.', 'vbaProject.bin');
    const total = fatSecs + dirSecs + miniFatSecs + miniStreamSecs + regSecs;
    const fat = new Array(fatSecs * SS / 4).fill(FREE);
    let cur = 0;
    const alloc = count => {
      if (!count) return END;
      const start = cur;
      for (let i = 0; i < count; i++) fat[cur + i] = i === count - 1 ? END : cur + i + 1;
      cur += count;
      return start;
    };
    for (let i = 0; i < fatSecs; i++) fat[i] = FATSECT;
    cur = fatSecs;
    const dirStart = alloc(dirSecs);
    const miniFatStart = alloc(miniFatSecs);
    const miniStreamStart = alloc(miniStreamSecs);
    regular.forEach(n => { n.start = alloc(Math.ceil(n.data.length / SS)); });

    const out = new Uint8Array(SS * (total + 1));
    const dv = new DataView(out.buffer);
    SIG.forEach((x, i) => { out[i] = x; });
    dv.setUint16(24, 0x3E, true);
    dv.setUint16(26, 3, true);
    dv.setUint16(28, 0xFFFE, true);
    dv.setUint16(30, 9, true);
    dv.setUint16(32, 6, true);
    dv.setUint32(44, fatSecs, true);
    dv.setUint32(48, dirStart, true);
    dv.setUint32(56, 4096, true);
    dv.setUint32(60, miniFatSecs ? miniFatStart : END, true);
    dv.setUint32(64, miniFatSecs, true);
    dv.setUint32(68, END, true);
    dv.setUint32(72, 0, true);
    for (let i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < fatSecs ? i : FREE, true);
    const so = s => (s + 1) * SS;
    fat.forEach((v, i) => dv.setUint32(so(0) + i * 4, v >>> 0, true));

    const root = nodes[0];
    root.start = miniStreamSecs ? miniStreamStart : END;
    root.size = miniLen;
    order.forEach(n => {
      const o = so(dirStart) + n.id * 128;
      const nm = n.name.slice(0, 31);
      for (let i = 0; i < nm.length; i++) dv.setUint16(o + i * 2, nm.charCodeAt(i), true);
      dv.setUint16(o + 64, (nm.length + 1) * 2, true);
      out[o + 66] = n.type;
      out[o + 67] = n.color;
      dv.setUint32(o + 68, n.left, true);
      dv.setUint32(o + 72, n.right, true);
      dv.setUint32(o + 76, n.child, true);
      if (n.clsid) out.set(n.clsid.subarray(0, 16), o + 80);
      dv.setUint32(o + 96, n.state || 0, true);
      if (n.created) out.set(n.created.subarray(0, 8), o + 100);
      if (n.modified) out.set(n.modified.subarray(0, 8), o + 108);
      const start = n.type === 2 ? n.start : n.type === 5 ? root.start : 0;
      dv.setUint32(o + 116, start, true);
      dv.setUint32(o + 120, n.type === 2 ? n.data.length : n.type === 5 ? root.size : 0, true);
    });
    for (let i = order.length; i < dirSecs * 4; i++) {
      const o = so(dirStart) + i * 128;
      dv.setUint32(o + 68, NOSTREAM, true);
      dv.setUint32(o + 72, NOSTREAM, true);
      dv.setUint32(o + 76, NOSTREAM, true);
    }
    const mfBase = so(miniFatStart);
    for (let i = 0; i < miniFatSecs * SS / 4; i++) dv.setUint32(mfBase + i * 4, i < miniFat.length ? miniFat[i] >>> 0 : FREE, true);
    const msBase = so(miniStreamStart);
    mini.forEach(m => out.set(m.data, msBase + m.at));
    regular.forEach(n => out.set(n.data, so(n.start)));
    return out;
  }

  Q.cfb = { isCfb, readCfb, writeCfb };
})();
