const marginRepo = require('../repositories/margin.repository');

/**
 * Service for margin (profit/loss) analysis per penjualan.
 * Margin formula: harga_jual - harga_beli (BPJS excluded).
 * For DP payments: margin is calculated based on actual money received (uang masuk).
 */

exports.getDatatablesData = function (params) {
  return marginRepo.getDatatablesData(params);
};

exports.getDetailById = function (id) {
  return marginRepo.getDetailById(id);
};

exports.getMarginSummary = function (filters) {
  return marginRepo.getMarginSummary(filters);
};

exports.getChartTrend = function (filters) {
  return marginRepo.getChartTrend(filters);
};

exports.getChartTopItems = function (filters) {
  return marginRepo.getChartTopItems(filters);
};

exports.getChartStatusBreakdown = function (filters) {
  return marginRepo.getChartStatusBreakdown(filters);
};

exports.getChartSalesMargin = function (filters) {
  return marginRepo.getChartSalesMargin(filters);
};
