/**
 * Import script: produk kacamata lensa.csv to master barang
 * Database target: DB_NAME=kacamata-pusat ONLY
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig);

const CSV_PATH = process.env.CSV_PATH || '/Users/ericanthony/Downloads/produk kacamata lensa.csv';

// Helper: parse CSV respecting quotes
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '\"') {
      if (inQuotes && nextChar === '\"') {
        currentVal += '\"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal);
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }
  return rows;
}

// Helper: normalize prescription values into standard optical decimal format (e.g. -0.25, +0.50, +2.75)
function normalizeRx(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s || s === '-') return null;
  let num = parseFloat(s);
  if (isNaN(num)) return null;
  if (!s.includes('.') && Math.abs(num) >= 25) {
    num = num / 100;
  }
  if (num === 0) return '0.00';
  return (num > 0 ? '+' : '') + num.toFixed(2);
}

// Helper: parse SPH, CYL, ADD, and side from lens name
function parseRxFromNama(name) {
  let sph = null;
  let cyl = null;
  let add = null;
  let side = null;

  if (/\s+L$/i.test(name)) side = 'L';
  else if (/\s+R$/i.test(name)) side = 'R';

  const addMatch = name.match(/add\s*[:\+]?\s*(\+?\d+(?:\.\d+)?)/i);
  if (addMatch) {
    add = normalizeRx(addMatch[1]);
  }

  const cylMatch = name.match(/(?:cyl|c)\s*[:\-]?\s*([+\-]\d+(?:\.\d+)?)/i);
  if (cylMatch) {
    cyl = normalizeRx(cylMatch[1]);
  }

  const sphMatch = name.match(/sph\s*[:]?\s*([+\-]?\d+(?:\.\d+)?)/i);
  if (sphMatch) {
    sph = normalizeRx(sphMatch[1]);
  } else if (/plano/i.test(name)) {
    sph = '0.00';
  }

  return { sph, cyl, add, side };
}

async function run() {
  console.log('=== Starting Master Barang Import for Pusat ===');

  // ── Step 0: STRICT SAFETY CHECK ──────────────────────────────────────────
  const targetDb = knex.client.connectionSettings.database || process.env.DB_NAME;
  console.log(`Connected to database: ${targetDb}`);
  if (targetDb !== 'kacamata-pusat') {
    console.error(`\n[FATAL] Expected database 'kacamata-pusat', but got '${targetDb}'!`);
    console.error('Operation aborted to protect live or cabang databases.');
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`\n[FATAL] CSV file not found at: ${CSV_PATH}`);
    process.exit(1);
  }

  // ── Step 1: Clean up master barang and transaksi data ────────────────────
  console.log('\n[1/4] Truncating master barang and transaction tables in kacamata-pusat...');
  await knex.raw(`
    TRUNCATE TABLE
      komisi_sales,
      pembayaran_penjualan,
      pembayaran_pembelian,
      penjualan_retur_detail,
      penjualan_retur,
      pembelian_retur_detail,
      pembelian_retur,
      penjualan_detail,
      penjualan,
      pembelian_detail,
      pembelian,
      kas,
      bukti_hitung_fisik,
      barang
    RESTART IDENTITY CASCADE;
  `);
  console.log('✓ Tables truncated.');

  // Explicitly ensure all related sequences are restarted at 1
  const sequences = [
    'barang_id_seq',
    'penjualan_id_seq',
    'penjualan_detail_id_seq',
    'pembayaran_penjualan_id_seq',
    'penjualan_retur_id_seq',
    'penjualan_retur_detail_id_seq',
    'pembelian_id_seq',
    'pembelian_detail_id_seq',
    'pembayaran_pembelian_id_seq',
    'pembelian_retur_id_seq',
    'pembelian_retur_detail_id_seq',
    'komisi_sales_id_seq',
    'kas_id_seq',
    'bukti_hitung_fisik_id_seq'
  ];
  for (const seq of sequences) {
    try {
      await knex.raw(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    } catch (err) {
      console.warn(`  Warning restarting sequence ${seq}: ${err.message}`);
    }
  }
  console.log('✓ All sequence increments successfully reset to 1.');

  // ── Step 2: Ensure categories exist in kategori table ─────────────────────
  console.log('\n[2/4] Syncing kategori...');
  const existingKategori = await knex('kategori').select('id', 'nama');
  const katMap = {};
  for (const k of existingKategori) {
    katMap[k.nama.toLowerCase()] = k.id;
  }

  const requiredCategories = ['Frame', 'Lensa', 'Aksesoris', 'Softlens', 'Lain-lain'];
  for (const catName of requiredCategories) {
    if (!katMap[catName.toLowerCase()]) {
      const [inserted] = await knex('kategori').insert({ nama: catName }).returning('*');
      katMap[catName.toLowerCase()] = inserted.id;
      console.log(`  Created missing category: "${catName}" (ID: ${inserted.id})`);
    }
  }
  console.log('✓ Categories ready:', katMap);

  // ── Step 3: Parse CSV file ────────────────────────────────────────────────
  console.log('\n[3/4] Parsing CSV file...');
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(csvContent);
  console.log(`Found ${rows.length - 1} data rows.`);

  const barangRows = [];
  const catStats = {};

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 5 || !cols[1]) continue;

    const rawCat = (cols[1] || '').trim();
    const rawName = (cols[3] || '').trim();
    if (!rawName) continue;

    const isShifted = (cols[9] === 'Ya' || cols[9] === 'Tidak');

    let hargaJual = 0;
    let qty = 0;

    if (isShifted) {
      hargaJual = parseFloat(cols[17]) || 0;
      if (cols[9] === 'Ya') {
        qty = parseInt(cols[10], 10) || 0;
      } else {
        qty = 0;
      }
    } else {
      hargaJual = parseFloat(cols[7]) || 0;
      if (cols[10] === 'Ya') {
        qty = parseInt(cols[11], 10) || 0;
      } else {
        qty = 0;
      }
    }

    // Fix data entry anomalies
    if (hargaJual === 600 && rawCat === 'Frame') {
      hargaJual = 600000;
    }
    if (hargaJual === 0 && rawCat === 'Lensa Bluecromic') {
      hargaJual = 225000;
    }

    // Category mapping
    let categoryName = 'Lensa';
    if (rawCat === 'Frame') categoryName = 'Frame';
    else if (rawCat === 'Aksesoris') categoryName = 'Aksesoris';
    else if (rawCat === 'Lainnya') {
      if (/softlens/i.test(rawName)) categoryName = 'Softlens';
      else categoryName = 'Lain-lain';
    } else if (rawCat.toLowerCase().startsWith('lensa')) {
      categoryName = 'Lensa';
    }

    const kategoriId = katMap[categoryName.toLowerCase()];
    catStats[categoryName] = (catStats[categoryName] || 0) + 1;

    // Rx fields for lenses
    let sph_r = null, sph_l = null, cyl_r = null, cyl_l = null, add_r = null, add_l = null;
    if (categoryName === 'Lensa') {
      const rx = parseRxFromNama(rawName);
      if (rx.side === 'L') {
        sph_l = rx.sph; cyl_l = rx.cyl; add_l = rx.add;
      } else if (rx.side === 'R') {
        sph_r = rx.sph; cyl_r = rx.cyl; add_r = rx.add;
      } else {
        sph_r = rx.sph; sph_l = rx.sph;
        cyl_r = rx.cyl; cyl_l = rx.cyl;
        add_r = rx.add; add_l = rx.add;
      }
    }

    const nextSeq = barangRows.length + 1;
    const barcode_id = 'BRG-' + String(nextSeq).padStart(6, '0');

    barangRows.push({
      nama_barang: rawName,
      kategori_id: kategoriId,
      qty: isNaN(qty) ? 0 : qty,
      harga_jual: Math.round(hargaJual),
      barcode_id: barcode_id,
      sph_r,
      sph_l,
      cyl_r,
      cyl_l,
      add_r,
      add_l
    });
  }

  console.log(`Parsed ${barangRows.length} barang items.`);
  console.log('Category distribution:', catStats);

  // ── Step 4: Batch insert into barang ─────────────────────────────────────
  console.log('\n[4/4] Inserting into barang...');
  const BATCH_SIZE = 100;
  for (let i = 0; i < barangRows.length; i += BATCH_SIZE) {
    const chunk = barangRows.slice(i, i + BATCH_SIZE);
    await knex('barang').insert(chunk);
    process.stdout.write(`  Inserted ${Math.min(i + BATCH_SIZE, barangRows.length)} / ${barangRows.length} items...\r`);
  }
  console.log(`\n✓ All ${barangRows.length} barang items successfully inserted!`);

  // Sync sequence to current max id
  await knex.raw(`SELECT setval('barang_id_seq', COALESCE((SELECT MAX(id) FROM barang), 1))`);
  console.log('✓ barang_id_seq synchronized to max id.');

  // Verify final count and sequences
  const countRes = await knex('barang').count('id as cnt').first();
  const maxIdRes = await knex('barang').max('id as max_id').first();
  const sampleItems = await knex('barang').select('id', 'barcode_id', 'nama_barang', 'qty', 'harga_jual').limit(5);

  console.log('\n=== Verification Summary ===');
  console.log(`Total barang in DB : ${countRes.cnt}`);
  console.log(`Max id in DB       : ${maxIdRes.max_id}`);
  console.log('Sample first 5 items in DB:');
  console.table(sampleItems);

  console.log('\nImport successfully completed!');
}

run()
  .catch((err) => {
    console.error('\nImport failed with error:', err);
    process.exit(1);
  })
  .finally(() => knex.destroy());
