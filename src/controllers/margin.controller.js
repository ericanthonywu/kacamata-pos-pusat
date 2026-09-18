const marginService = require('../services/margin.service');
const salesService = require('../services/sales.service');
const { todayStr, firstDayOfMonth } = require('../utils/date.helper');

/**
 * Render margin analysis page (summary + charts + DT placeholder).
 */
exports.index = async function (req, res, next) {
  try {
    const filters = {
      from: req.query.from || firstDayOfMonth(),
      to: req.query.to || todayStr(),
      sales_id: req.query.sales_id || null,
      status_bayar: req.query.status_bayar || null,
    };

    const [summary, salesList] = await Promise.all([
      marginService.getMarginSummary(filters),
      salesService.getAll(),
    ]);

    res.render('laporan/margin', {
      title: 'Analisis Margin',
      summary,
      salesList,
      filters,
      activePage: 'laporan-margin',
    });
  } catch (err) { next(err); }
};

/**
 * Server-side DataTables endpoint.
 */
exports.datatables = async function (req, res) {
  try {
    const result = await marginService.getDatatablesData(req.query);
    res.json({
      draw: parseInt(req.query.draw),
      recordsTotal: result.recordsTotal,
      recordsFiltered: result.recordsFiltered,
      data: result.data,
      grandTotals: result.grandTotals,
    });
  } catch (err) {
    res.json({ error: err.message });
  }
};

/**
 * API: Get margin detail for a single penjualan (expand row).
 */
exports.detail = async function (req, res) {
  try {
    const data = await marginService.getDetailById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * API: Chart data endpoints.
 */
exports.chartTrend = async function (req, res) {
  try {
    const data = await marginService.getChartTrend({
      from: req.query.from,
      to: req.query.to,
      sales_id: req.query.sales_id,
      status_bayar: req.query.status_bayar,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.chartTopItems = async function (req, res) {
  try {
    const data = await marginService.getChartTopItems({
      from: req.query.from,
      to: req.query.to,
      sales_id: req.query.sales_id,
      status_bayar: req.query.status_bayar,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.chartStatus = async function (req, res) {
  try {
    const data = await marginService.getChartStatusBreakdown({
      from: req.query.from,
      to: req.query.to,
      sales_id: req.query.sales_id,
      status_bayar: req.query.status_bayar,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.chartSalesMargin = async function (req, res) {
  try {
    const data = await marginService.getChartSalesMargin({
      from: req.query.from,
      to: req.query.to,
      sales_id: req.query.sales_id,
      status_bayar: req.query.status_bayar,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
