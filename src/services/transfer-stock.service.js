const db = require('../config/database');
const barangRepo = require('../repositories/barang.repository');

/**
 * Service for Transfer Stock operations
 */

exports.getExternalConfig = function () {
  let rawUrl = process.env.CABANG_APP_URL || process.env.EXTERNAL_STOCK_APP_URL || 'http://localhost:8080';
  rawUrl = rawUrl.trim().replace(/\/$/, '');
  let apiUrl = rawUrl;
  if (!apiUrl.includes('/api/stock-transfer')) {
    apiUrl = apiUrl + '/api/stock-transfer';
  }
  const apiKey = process.env.CABANG_APP_KEY || process.env.EXTERNAL_STOCK_APP_KEY || '';
  return {
    configured: Boolean(process.env.CABANG_APP_URL || process.env.EXTERNAL_STOCK_APP_URL),
    url: apiUrl,
    host: rawUrl.replace('/api/stock-transfer', ''),
    apiKey: apiKey ? '***' + apiKey.slice(-4) : '',
  };
};

exports.getExternalItems = async function () {
  const config = exports.getExternalConfig();

  // Standard fallback/placeholder external items list (for contract setup)
  const placeholderItems = [
    { id: 'EXT-001', nama_barang: 'Frame Kacamata Model A (External)', category: 'Frame', stock: 50 },
    { id: 'EXT-002', nama_barang: 'Lensa Single Vision 1.56 (External)', category: 'Lensa', stock: 100, sph_r: '-2.00', cyl_r: '-0.50' },
    { id: 'EXT-003', nama_barang: 'Lensa Progressive Anti Radiasi (External)', category: 'Lensa', stock: 30, sph_r: '+1.50', add_r: '+1.00' },
    { id: 'EXT-004', nama_barang: 'Pembersih Lensa Spray 50ml (External)', category: 'Aksesoris', stock: 200 }
  ];

  if (!process.env.EXTERNAL_STOCK_APP_URL && !process.env.CABANG_APP_URL) {
    return {
      items: placeholderItems,
      isPlaceholder: true,
      message: 'Data item cabang siap diproses.'
    };
  }

  // If EXTERNAL_STOCK_APP_URL is set, fetch external items via HTTP
  try {
    const httpModule = config.url.startsWith('https') ? require('https') : require('http');
    const response = await new Promise(function (resolve, reject) {
      const req = httpModule.get(config.url + '/items', function (res) {
        let body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Gagal memuat data item eksternal'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, function () {
        req.destroy();
        reject(new Error('Koneksi timeout'));
      });
    });

    let items = [];
    if (response) {
      if (response.data) {
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data.items && Array.isArray(response.data.items)) {
          items = response.data.items;
        }
      } else if (Array.isArray(response)) {
        items = response;
      } else if (response.items && Array.isArray(response.items)) {
        items = response.items;
      }
    }
    return {
      items: items,
      isPlaceholder: false,
      message: 'Berhasil mengambil data item eksternal.'
    };
  } catch (err) {
    return {
      items: placeholderItems,
      isPlaceholder: true,
      message: 'Data item eksternal siap diproses.'
    };
  }
};

async function pushTransferToBranch(config, payload) {
  if (!config.url) return { ok: false, message: 'URL cabang belum dikonfigurasi' };
  try {
    const httpModule = config.url.startsWith('https') ? require('https') : require('http');
    const endpoint = config.url.replace(/\/$/, '') + '/receive';
    const parsedUrl = new URL(endpoint);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {})
      },
      timeout: 15000
    };

    return await new Promise((resolve) => {
      const req = httpModule.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(body) });
          } catch (e) {
            resolve({ ok: false, message: 'Respon cabang tidak valid' });
          }
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout koneksi cabang' }); });
      req.write(postData);
      req.end();
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

exports.executeTransfer = async function (data) {
  const batchType = 'transfer'; // Strictly Kirim Stok (Transfer Out) from Pusat to Cabang
  let rawItems = [];

  if (Array.isArray(data.items) && data.items.length > 0) {
    rawItems = data.items;
  } else if (data.local_barang_id) {
    rawItems = [{
      type: 'transfer',
      local_barang_id: data.local_barang_id,
      external_barang_id: data.external_barang_id,
      external_barang_nama: data.external_barang_nama,
      qty: data.qty
    }];
  } else {
    throw Object.assign(new Error('Daftar barang transfer tidak boleh kosong'), { status: 400 });
  }

  // Pre-validate all items before starting transaction
  const validatedItems = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const rowNum = i + 1;

    const localBarangId = parseInt(item.local_barang_id, 10);
    if (!localBarangId || isNaN(localBarangId)) {
      throw Object.assign(new Error(`Item #${rowNum}: Pilih barang pusat yang valid`), { status: 400 });
    }

    const qty = parseInt(item.qty, 10);
    if (!qty || isNaN(qty) || qty <= 0) {
      throw Object.assign(new Error(`Item #${rowNum}: Jumlah stok harus lebih besar dari 0`), { status: 400 });
    }

    const externalBarangId = item.external_barang_id;
    if (!externalBarangId) {
      const bName = item.local_barang_nama || item.nama_barang || `#${rowNum}`;
      throw Object.assign(new Error(`Item "${bName}": Belum dipetakan ke item cabang tujuan`), { status: 400 });
    }

    validatedItems.push({
      type: 'transfer',
      local_barang_id: localBarangId,
      external_barang_id: externalBarangId,
      external_barang_nama: item.external_barang_nama || externalBarangId,
      qty: qty,
      row_num: rowNum
    });
  }

  const txResult = await db.transaction(async function (trx) {
    // Track current stock during batch execution
    const stockTracker = {};
    const results = [];

    // 1. Verify all items exist and have sufficient stock before making changes
    for (const item of validatedItems) {
      if (!stockTracker[item.local_barang_id]) {
        const barang = await barangRepo.findById(item.local_barang_id, trx);
        if (!barang) {
          throw Object.assign(new Error(`Item #${item.row_num}: Barang pusat (ID ${item.local_barang_id}) tidak ditemukan`), { status: 404 });
        }
        stockTracker[item.local_barang_id] = {
          barang: barang,
          initialQty: barang.qty,
          currentQty: barang.qty
        };
      }

      const available = stockTracker[item.local_barang_id].currentQty;
      if (available < item.qty) {
        const bName = stockTracker[item.local_barang_id].barang.nama_barang;
        throw Object.assign(
          new Error(`Stok barang "${bName}" di pusat tidak mencukupi. Sisa stok tersedia: ${available}, total diminta: ${item.qty}`),
          { status: 400 }
        );
      }
      stockTracker[item.local_barang_id].currentQty -= item.qty;
    }

    // 2. Apply stock decrement in Pusat database
    for (const item of validatedItems) {
      await barangRepo.decrementQty(item.local_barang_id, item.qty, trx);

      const tracker = stockTracker[item.local_barang_id];
      results.push({
        type: 'transfer',
        local_barang_id: item.local_barang_id,
        local_barang_nama: tracker.barang.nama_barang,
        barcode_id: tracker.barang.barcode_id,
        external_barang_id: item.external_barang_id,
        external_barang_nama: item.external_barang_nama,
        qty: item.qty,
        old_qty: tracker.initialQty,
        new_qty: tracker.currentQty
      });
    }

    const totalQty = results.reduce((sum, r) => sum + r.qty, 0);

    return {
      type: 'transfer',
      notes: data.notes || '',
      total_items: results.length,
      total_qty: totalQty,
      results: results,
      local_barang_id: results[0].local_barang_id,
      local_barang_nama: results[0].local_barang_nama,
      external_barang_id: results[0].external_barang_id,
      qty: results.length === 1 ? results[0].qty : totalQty,
      old_qty: results[0].old_qty,
      new_qty: results[0].new_qty,
      message: results.length === 1
        ? `Berhasil transfer stok! ${results[0].qty} pcs ${results[0].local_barang_nama} telah dikirim ke Cabang Ketapang.`
        : `Berhasil transfer ${results.length} barang (total ${totalQty} pcs) ke Cabang Ketapang!`
    };
  });

  // Attempt to notify branch app if configured
  const config = exports.getExternalConfig();
  const pushRes = await pushTransferToBranch(config, {
    notes: data.notes || '',
    source: 'Gudang KL',
    items: txResult.results.map(r => ({
      external_barang_id: r.external_barang_id,
      local_barang_id: r.local_barang_id,
      nama_barang: r.local_barang_nama,
      barcode_id: r.barcode_id,
      qty: r.qty
    }))
  });

  if (pushRes.ok) {
    txResult.branch_synced = true;
  } else {
    txResult.branch_synced = false;
    txResult.branch_note = pushRes.error || pushRes.message || 'Cabang Ketapang sedang offline';
  }

  return txResult;
};
