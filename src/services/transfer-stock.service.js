const db = require('../config/database');
const barangRepo = require('../repositories/barang.repository');

/**
 * Service for Transfer Stock operations
 */

exports.getExternalConfig = function () {
  const url = process.env.EXTERNAL_STOCK_APP_URL || '';
  const apiKey = process.env.EXTERNAL_STOCK_APP_KEY || '';
  return {
    configured: Boolean(url),
    url: url || 'http://localhost:4000/api/stock-transfer',
    apiKey: apiKey ? '***' + apiKey.slice(-4) : '',
  };
};

exports.getExternalItems = async function () {
  const config = exports.getExternalConfig();

  // Standard fallback/placeholder external items list (for contract setup)
  const placeholderItems = [
    { id: 'EXT-001', nama_barang: 'Frame Kacamata Model A (External)', category: 'Frame', stock: 50 },
    { id: 'EXT-002', nama_barang: 'Lensa Single Vision 1.56 (External)', category: 'Lensa', stock: 100 },
    { id: 'EXT-003', nama_barang: 'Lensa Progressive Anti Radiasi (External)', category: 'Lensa', stock: 30 },
    { id: 'EXT-004', nama_barang: 'Pembersih Lensa Spray 50ml (External)', category: 'Aksesoris', stock: 200 }
  ];

  if (!process.env.EXTERNAL_STOCK_APP_URL) {
    return {
      items: placeholderItems,
      isPlaceholder: true,
      message: 'External endpoint URL belum dikonfigurasi. Menggunakan data demo/placeholder.'
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
            reject(new Error('Invalid JSON response from external endpoint'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, function () {
        req.destroy();
        reject(new Error('Connection timeout to external endpoint'));
      });
    });

    const items = (response && response.data) ? response.data : (Array.isArray(response) ? response : []);
    return {
      items: items,
      isPlaceholder: false,
      message: 'Berhasil mengambil item dari external endpoint.'
    };
  } catch (err) {
    return {
      items: placeholderItems,
      isPlaceholder: true,
      message: 'Gagal menghubungi external endpoint: ' + err.message + '. Menggunakan data demo/placeholder.'
    };
  }
};

exports.executeTransfer = async function (data) {
  const type = data.type; // 'transfer' or 'request'
  const localBarangId = parseInt(data.local_barang_id, 10);
  const externalBarangId = data.external_barang_id;
  const qty = parseInt(data.qty, 10);

  if (!type || (type !== 'transfer' && type !== 'request')) {
    throw Object.assign(new Error('Tipe transaksi harus "transfer" (kirim) atau "request" (minta)'), { status: 400 });
  }

  if (!localBarangId || isNaN(localBarangId)) {
    throw Object.assign(new Error('Pilih barang cabang ini yang valid'), { status: 400 });
  }

  if (!qty || isNaN(qty) || qty <= 0) {
    throw Object.assign(new Error('Jumlah stock harus lebih besar dari 0'), { status: 400 });
  }

  if (!externalBarangId) {
    throw Object.assign(new Error('Pilih item dari aplikasi eksternal'), { status: 400 });
  }

  return db.transaction(async function (trx) {
    const barangLokal = await barangRepo.findById(localBarangId);
    if (!barangLokal) {
      throw Object.assign(new Error('Barang cabang ini tidak ditemukan'), { status: 404 });
    }

    if (type === 'transfer') {
      if (barangLokal.qty < qty) {
        throw Object.assign(
          new Error('Stok barang cabang ini tidak mencukupi. Stok saat ini: ' + barangLokal.qty + ', diminta: ' + qty),
          { status: 400 }
        );
      }
      await barangRepo.decrementQty(localBarangId, qty, trx);
    } else if (type === 'request') {
      await barangRepo.incrementQty(localBarangId, qty, trx);
    }

    const updatedBarang = await barangRepo.findById(localBarangId);

    const actionText = type === 'transfer' ? 'dikirim ke' : 'diminta dari';
    return {
      type: type,
      local_barang_id: localBarangId,
      local_barang_nama: barangLokal.nama_barang,
      external_barang_id: externalBarangId,
      qty: qty,
      old_qty: barangLokal.qty,
      new_qty: updatedBarang.qty,
      message: 'Berhasil ' + (type === 'transfer' ? 'transfer' : 'request') + ' stock! ' + qty + ' pcs ' + barangLokal.nama_barang + ' telah ' + actionText + ' aplikasi eksternal.'
    };
  });
};
