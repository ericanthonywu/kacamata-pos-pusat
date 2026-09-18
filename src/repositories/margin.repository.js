const db = require('../config/database');

/**
 * Read-only reporting repository for margin (profit/loss) analysis.
 * Joins penjualan, penjualan_detail, pembelian_detail (for harga_beli),
 * and pembayaran_penjualan for cash-flow-based margin.
 */

// ── Reusable raw SQL for latest harga_beli per barang ──
const SQL_HARGA_BELI = `(
  SELECT pd2.harga_beli FROM pembelian_detail pd2
  INNER JOIN pembelian pb ON pd2.pembelian_id = pb.id
  WHERE pd2.barang_id = penjualan_detail.barang_id
  ORDER BY pb.tanggal_pembelian DESC, pb.id DESC
  LIMIT 1
)`;

// ── Reusable subquery: total cost per penjualan ──
const SQL_TOTAL_COST = `COALESCE((
  SELECT SUM(
    COALESCE((SELECT pd2.harga_beli FROM pembelian_detail pd2
     INNER JOIN pembelian pb ON pd2.pembelian_id = pb.id
     WHERE pd2.barang_id = pd.barang_id
     ORDER BY pb.tanggal_pembelian DESC, pb.id DESC
     LIMIT 1), 0) * pd.jumlah
  ) FROM penjualan_detail pd WHERE pd.penjualan_id = penjualan.id
), 0)`;

// ── Reusable subquery: total uang masuk per penjualan ──
const SQL_TOTAL_UANG_MASUK = `COALESCE((
  SELECT SUM(pp.jumlah_bayar)
  FROM pembayaran_penjualan pp
  WHERE pp.penjualan_id = penjualan.id
), 0)`;

/**
 * Builds the base query with common filters applied.
 */
function buildBaseQuery(filters) {
  const { from, to, sales_id, status_bayar } = filters;
  let q = db('penjualan')
    .leftJoin('pelanggan', 'penjualan.pelanggan_id', 'pelanggan.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (from) q = q.where('penjualan.order_date', '>=', from);
  if (to) q = q.where('penjualan.order_date', '<=', to);
  if (sales_id) q = q.where('penjualan.sales_id', sales_id);
  if (status_bayar) q = q.where('penjualan.status_bayar', status_bayar);

  return q;
}

/**
 * Server-side DataTables endpoint for margin data.
 * Each row includes computed margin and uang masuk via SQL subqueries.
 */
exports.getDatatablesData = async function (params) {
  const { start, length, search, order, start_date, end_date, sales_id, status_bayar } = params;

  let baseQuery = db('penjualan')
    .leftJoin('pelanggan', 'penjualan.pelanggan_id', 'pelanggan.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (start_date) baseQuery = baseQuery.where('penjualan.order_date', '>=', start_date);
  if (end_date) baseQuery = baseQuery.where('penjualan.order_date', '<=', end_date);
  if (sales_id) baseQuery = baseQuery.where('penjualan.sales_id', sales_id);
  if (status_bayar) baseQuery = baseQuery.where('penjualan.status_bayar', status_bayar);

  // Total records (before search)
  const totalCountRes = await baseQuery.clone().count('penjualan.id as count').first();
  const recordsTotal = parseInt(totalCountRes.count);

  // Search filter
  if (search && search.value) {
    baseQuery = baseQuery.where(function () {
      this.where('penjualan.no_nota', 'ilike', `%${search.value}%`)
        .orWhere('pelanggan.nama', 'ilike', `%${search.value}%`)
        .orWhere('sales.nama', 'ilike', `%${search.value}%`);
    });
  }

  // Filtered count
  const filteredCountRes = await baseQuery.clone().count('penjualan.id as count').first();
  const recordsFiltered = parseInt(filteredCountRes.count);

  // Grand totals for filtered set (for footer summary)
  const grandTotals = await baseQuery.clone().select(
    db.raw('COALESCE(SUM(penjualan.subtotal), 0) as grand_penjualan'),
    db.raw(`COALESCE(SUM(${SQL_TOTAL_COST}), 0) as grand_cost`),
    db.raw(`COALESCE(SUM(${SQL_TOTAL_UANG_MASUK}), 0) as grand_uang_masuk`)
  ).first();

  // Column mapping for sorting
  const columns = [
    null, // expand icon
    'penjualan.order_date',
    'penjualan.no_nota',
    'pelanggan.nama',
    'sales.nama',
    'penjualan.subtotal',
    null, // modal (computed)
    null, // margin (computed)
    'penjualan.status_bayar',
    null, // uang masuk (computed)
    null, // margin kas (computed)
  ];

  if (order && order.length > 0) {
    const colIndex = parseInt(order[0].column);
    const dir = order[0].dir === 'desc' ? 'desc' : 'asc';
    const colName = columns[colIndex];
    if (colName) {
      baseQuery = baseQuery.orderBy(colName, dir);
    } else if (colIndex === 6) {
      // Sort by total cost
      baseQuery = baseQuery.orderByRaw(`${SQL_TOTAL_COST} ${dir}`);
    } else if (colIndex === 7) {
      // Sort by margin
      baseQuery = baseQuery.orderByRaw(`(penjualan.subtotal - ${SQL_TOTAL_COST}) ${dir}`);
    } else if (colIndex === 9) {
      // Sort by uang masuk
      baseQuery = baseQuery.orderByRaw(`${SQL_TOTAL_UANG_MASUK} ${dir}`);
    } else if (colIndex === 10) {
      // Sort by margin kas
      baseQuery = baseQuery.orderByRaw(`(${SQL_TOTAL_UANG_MASUK} - ${SQL_TOTAL_COST}) ${dir}`);
    } else {
      baseQuery = baseQuery.orderBy('penjualan.order_date', 'desc');
    }
  } else {
    baseQuery = baseQuery.orderBy('penjualan.order_date', 'desc').orderBy('penjualan.created_at', 'desc');
  }

  // Pagination
  if (length > 0) {
    baseQuery = baseQuery.limit(length).offset(start);
  }

  const data = await baseQuery.select(
    'penjualan.id',
    'penjualan.no_nota',
    'penjualan.order_date',
    'penjualan.subtotal',
    'penjualan.bpjs',
    'penjualan.total',
    'penjualan.dp',
    'penjualan.status_bayar',
    'penjualan.is_b2b',
    'pelanggan.nama as pelanggan_nama',
    'sales.nama as sales_nama',
    db.raw(`${SQL_TOTAL_COST} as total_harga_beli`),
    db.raw(`${SQL_TOTAL_UANG_MASUK} as total_uang_masuk`),
    db.raw(`(penjualan.subtotal - ${SQL_TOTAL_COST}) as margin_full`),
    db.raw(`(${SQL_TOTAL_UANG_MASUK} - ${SQL_TOTAL_COST}) as margin_kas`)
  );

  return {
    recordsTotal,
    recordsFiltered,
    data: data.map(r => ({
      ...r,
      total_harga_beli: parseFloat(r.total_harga_beli) || 0,
      total_uang_masuk: parseFloat(r.total_uang_masuk) || 0,
      margin_full: parseFloat(r.margin_full) || 0,
      margin_kas: parseFloat(r.margin_kas) || 0,
    })),
    grandTotals: {
      grand_penjualan: parseFloat(grandTotals.grand_penjualan) || 0,
      grand_cost: parseFloat(grandTotals.grand_cost) || 0,
      grand_uang_masuk: parseFloat(grandTotals.grand_uang_masuk) || 0,
      grand_margin: (parseFloat(grandTotals.grand_penjualan) || 0) - (parseFloat(grandTotals.grand_cost) || 0),
    },
  };
};

/**
 * Get detail for a single penjualan: items + payments with margin breakdown.
 * Used by the AJAX expand-row.
 */
exports.getDetailById = async function (penjualanId) {
  const penjualan = await db('penjualan')
    .select('penjualan.*', 'pelanggan.nama as pelanggan_nama', 'sales.nama as sales_nama')
    .leftJoin('pelanggan', 'penjualan.pelanggan_id', 'pelanggan.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id')
    .where('penjualan.id', penjualanId)
    .first();

  if (!penjualan) return null;

  // Detail items with harga_beli
  const details = await db('penjualan_detail')
    .select(
      'penjualan_detail.*',
      'barang.nama_barang',
      'barang.barcode_id',
      db.raw(`${SQL_HARGA_BELI} as harga_beli`)
    )
    .leftJoin('barang', 'penjualan_detail.barang_id', 'barang.id')
    .where('penjualan_detail.penjualan_id', penjualanId)
    .orderBy('penjualan_detail.tipe');

  // Payments
  const pembayaran = await db('pembayaran_penjualan')
    .select('pembayaran_penjualan.*', 'metode_pembayaran.nama as metode_pembayaran_nama')
    .leftJoin('metode_pembayaran', 'pembayaran_penjualan.metode_bayar_id', 'metode_pembayaran.id')
    .where('pembayaran_penjualan.penjualan_id', penjualanId)
    .orderBy('pembayaran_penjualan.tanggal_bayar', 'asc')
    .orderBy('pembayaran_penjualan.id', 'asc');

  // Enrich details
  let totalHargaBeli = 0;
  const enrichedDetails = details.map(d => {
    const hargaBeli = parseFloat(d.harga_beli) || 0;
    const hargaJualLine = (parseFloat(d.harga) - parseFloat(d.diskon || 0)) * parseInt(d.jumlah || 1);
    const costLine = hargaBeli * parseInt(d.jumlah || 1);
    totalHargaBeli += costLine;
    return { ...d, harga_beli: hargaBeli, harga_jual_line: hargaJualLine, cost_line: costLine, margin_line: hargaJualLine - costLine };
  });

  // Enrich payments with cumulative margin
  const totalPenjualan = parseFloat(penjualan.subtotal) || 0;
  let cumulative = 0;
  const enrichedPembayaran = pembayaran.map((pb, idx) => {
    cumulative += parseFloat(pb.jumlah_bayar || 0);
    return {
      ...pb,
      no: idx + 1,
      cumulative_payment: cumulative,
      margin_so_far: cumulative - totalHargaBeli,
      sisa_piutang: totalPenjualan - cumulative,
    };
  });

  return {
    ...penjualan,
    detail: enrichedDetails,
    pembayaran: enrichedPembayaran,
    total_harga_beli: totalHargaBeli,
    total_uang_masuk: cumulative,
    margin_full: totalPenjualan - totalHargaBeli,
  };
};

/**
 * Get summary/analytics for margin within a date range.
 */
exports.getMarginSummary = async function ({ from, to, sales_id, status_bayar } = {}) {
  let baseQuery = buildBaseQuery({ from, to, sales_id, status_bayar });

  const totals = await baseQuery.clone().select(
    db.raw('COUNT(penjualan.id) as total_transaksi'),
    db.raw('COALESCE(SUM(penjualan.subtotal), 0) as total_penjualan'),
    db.raw("COALESCE(SUM(CASE WHEN penjualan.status_bayar = 'lunas' THEN 1 ELSE 0 END), 0) as total_lunas"),
    db.raw("COALESCE(SUM(CASE WHEN penjualan.status_bayar = 'dp' THEN 1 ELSE 0 END), 0) as total_dp"),
    db.raw("COALESCE(SUM(CASE WHEN penjualan.status_bayar = 'belum_lunas' THEN 1 ELSE 0 END), 0) as total_belum_lunas")
  ).first();

  // Total harga_beli (cost)
  let costQuery = db('penjualan_detail')
    .innerJoin('penjualan', 'penjualan_detail.penjualan_id', 'penjualan.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');
  if (from) costQuery = costQuery.where('penjualan.order_date', '>=', from);
  if (to) costQuery = costQuery.where('penjualan.order_date', '<=', to);
  if (sales_id) costQuery = costQuery.where('penjualan.sales_id', sales_id);
  if (status_bayar) costQuery = costQuery.where('penjualan.status_bayar', status_bayar);

  const costResult = await costQuery.select(
    db.raw(`COALESCE(SUM(${SQL_HARGA_BELI} * penjualan_detail.jumlah), 0) as total_cost`)
  ).first();

  // Total uang masuk
  let uangMasukQuery = db('pembayaran_penjualan')
    .innerJoin('penjualan', 'pembayaran_penjualan.penjualan_id', 'penjualan.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');
  if (from) uangMasukQuery = uangMasukQuery.where('penjualan.order_date', '>=', from);
  if (to) uangMasukQuery = uangMasukQuery.where('penjualan.order_date', '<=', to);
  if (sales_id) uangMasukQuery = uangMasukQuery.where('penjualan.sales_id', sales_id);
  if (status_bayar) uangMasukQuery = uangMasukQuery.where('penjualan.status_bayar', status_bayar);

  const uangMasukResult = await uangMasukQuery.select(
    db.raw('COALESCE(SUM(pembayaran_penjualan.jumlah_bayar), 0) as total_uang_masuk')
  ).first();

  const totalPenjualan = parseFloat(totals.total_penjualan) || 0;
  const totalCost = parseFloat(costResult.total_cost) || 0;
  const totalUangMasuk = parseFloat(uangMasukResult.total_uang_masuk) || 0;
  const totalMargin = totalPenjualan - totalCost;
  const marginPersen = totalPenjualan > 0 ? (totalMargin / totalPenjualan * 100) : 0;

  return {
    total_transaksi: parseInt(totals.total_transaksi) || 0,
    total_lunas: parseInt(totals.total_lunas) || 0,
    total_dp: parseInt(totals.total_dp) || 0,
    total_belum_lunas: parseInt(totals.total_belum_lunas) || 0,
    total_penjualan: totalPenjualan,
    total_cost: totalCost,
    total_uang_masuk: totalUangMasuk,
    total_margin: totalMargin,
    margin_persen: marginPersen,
  };
};

/**
 * Chart data: daily margin trend (revenue vs cost vs margin).
 */
exports.getChartTrend = async function ({ from, to, sales_id, status_bayar } = {}) {
  let query = db('penjualan')
    .select(
      db.raw("to_char(penjualan.order_date, 'YYYY-MM-DD') as tanggal"),
      db.raw('COALESCE(SUM(penjualan.subtotal), 0) as revenue'),
      db.raw(`COALESCE(SUM(${SQL_TOTAL_COST}), 0) as cost`),
      db.raw('COUNT(penjualan.id) as jumlah_transaksi')
    )
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (from) query = query.where('penjualan.order_date', '>=', from);
  if (to) query = query.where('penjualan.order_date', '<=', to);
  if (sales_id) query = query.where('penjualan.sales_id', sales_id);
  if (status_bayar) query = query.where('penjualan.status_bayar', status_bayar);

  const data = await query.groupByRaw('1').orderByRaw('1 ASC');

  return data.map(r => ({
    tanggal: r.tanggal,
    revenue: parseFloat(r.revenue) || 0,
    cost: parseFloat(r.cost) || 0,
    margin: (parseFloat(r.revenue) || 0) - (parseFloat(r.cost) || 0),
    jumlah_transaksi: parseInt(r.jumlah_transaksi) || 0,
  }));
};

/**
 * Chart data: top margin items (most profitable).
 */
exports.getChartTopItems = async function ({ from, to, sales_id, status_bayar } = {}) {
  let query = db('penjualan_detail')
    .select(
      'barang.nama_barang',
      db.raw('SUM(penjualan_detail.jumlah) as total_qty'),
      db.raw('SUM((penjualan_detail.harga - COALESCE(penjualan_detail.diskon, 0)) * penjualan_detail.jumlah) as total_revenue'),
      db.raw(`SUM(COALESCE(${SQL_HARGA_BELI}, 0) * penjualan_detail.jumlah) as total_cost`)
    )
    .innerJoin('penjualan', 'penjualan_detail.penjualan_id', 'penjualan.id')
    .innerJoin('barang', 'penjualan_detail.barang_id', 'barang.id')
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (from) query = query.where('penjualan.order_date', '>=', from);
  if (to) query = query.where('penjualan.order_date', '<=', to);
  if (sales_id) query = query.where('penjualan.sales_id', sales_id);
  if (status_bayar) query = query.where('penjualan.status_bayar', status_bayar);

  const data = await query
    .groupBy('barang.id', 'barang.nama_barang')
    .orderByRaw(`(SUM((penjualan_detail.harga - COALESCE(penjualan_detail.diskon, 0)) * penjualan_detail.jumlah) - SUM(COALESCE(${SQL_HARGA_BELI}, 0) * penjualan_detail.jumlah)) DESC`)
    .limit(10);

  return data.map(r => ({
    nama_barang: r.nama_barang,
    total_qty: parseInt(r.total_qty) || 0,
    revenue: parseFloat(r.total_revenue) || 0,
    cost: parseFloat(r.total_cost) || 0,
    margin: (parseFloat(r.total_revenue) || 0) - (parseFloat(r.total_cost) || 0),
  }));
};

/**
 * Chart data: margin by status breakdown.
 */
exports.getChartStatusBreakdown = async function ({ from, to, sales_id, status_bayar } = {}) {
  let query = db('penjualan')
    .select(
      'penjualan.status_bayar',
      db.raw('COUNT(*) as jumlah'),
      db.raw('COALESCE(SUM(penjualan.subtotal), 0) as revenue'),
      db.raw(`COALESCE(SUM(${SQL_TOTAL_COST}), 0) as cost`)
    )
    .leftJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (from) query = query.where('penjualan.order_date', '>=', from);
  if (to) query = query.where('penjualan.order_date', '<=', to);
  if (sales_id) query = query.where('penjualan.sales_id', sales_id);
  if (status_bayar) query = query.where('penjualan.status_bayar', status_bayar);

  const data = await query.groupBy('penjualan.status_bayar');

  const labelMap = { lunas: 'Lunas', dp: 'DP', belum_lunas: 'Belum Lunas' };
  return data.map(r => ({
    status: labelMap[r.status_bayar] || r.status_bayar,
    raw_status: r.status_bayar,
    jumlah: parseInt(r.jumlah) || 0,
    revenue: parseFloat(r.revenue) || 0,
    cost: parseFloat(r.cost) || 0,
    margin: (parseFloat(r.revenue) || 0) - (parseFloat(r.cost) || 0),
  }));
};

/**
 * Chart data: margin per sales.
 */
exports.getChartSalesMargin = async function ({ from, to, sales_id, status_bayar } = {}) {
  let query = db('penjualan')
    .select(
      'sales.nama as sales_nama',
      db.raw('COUNT(penjualan.id) as total_transaksi'),
      db.raw('COALESCE(SUM(penjualan.subtotal), 0) as revenue'),
      db.raw(`COALESCE(SUM(${SQL_TOTAL_COST}), 0) as cost`)
    )
    .innerJoin('sales', 'penjualan.sales_id', 'sales.id');

  if (from) query = query.where('penjualan.order_date', '>=', from);
  if (to) query = query.where('penjualan.order_date', '<=', to);
  if (sales_id) query = query.where('penjualan.sales_id', sales_id);
  if (status_bayar) query = query.where('penjualan.status_bayar', status_bayar);

  const data = await query
    .groupBy('sales.id', 'sales.nama')
    .orderByRaw(`(COALESCE(SUM(penjualan.subtotal), 0) - COALESCE(SUM(${SQL_TOTAL_COST}), 0)) DESC`);

  return data.map(r => ({
    sales_nama: r.sales_nama,
    total_transaksi: parseInt(r.total_transaksi) || 0,
    revenue: parseFloat(r.revenue) || 0,
    cost: parseFloat(r.cost) || 0,
    margin: (parseFloat(r.revenue) || 0) - (parseFloat(r.cost) || 0),
  }));
};
