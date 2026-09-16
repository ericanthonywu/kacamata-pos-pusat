const transferStockService = require('../services/transfer-stock.service');
const barangService = require('../services/barang.service');
const { ok, fail } = require('../utils/response');

exports.index = async function (req, res, next) {
  try {
    const barangList = await barangService.getAll();
    const externalConfig = transferStockService.getExternalConfig();
    res.render('transfer-stock/index', {
      title: 'Transfer Stock',
      activePage: 'transfer-stock',
      barangList: barangList,
      externalConfig: externalConfig
    });
  } catch (err) {
    next(err);
  }
};

exports.getExternalItems = async function (req, res) {
  try {
    const result = await transferStockService.getExternalItems();
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
};

exports.executeTransfer = async function (req, res) {
  try {
    const result = await transferStockService.executeTransfer(req.body);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
};
