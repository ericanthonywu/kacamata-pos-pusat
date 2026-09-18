const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/laporan.controller');
const marginC = require('../controllers/margin.controller');
const { requireAdmin } = require('../middleware/rbac');

router.get('/kas', auth, c.kas);
router.get('/kas/dt', auth, c.kasDatatables);
router.get('/kas/chart', auth, c.kasChart);
router.get('/komisi', auth, requireAdmin, c.komisi);
router.get('/komisi/detail/:sales_id', auth, requireAdmin, c.komisiDetail);

// Margin analysis (admin only)
router.get('/margin', auth, requireAdmin, marginC.index);
router.get('/margin/dt', auth, requireAdmin, marginC.datatables);
router.get('/margin/detail/:id', auth, requireAdmin, marginC.detail);
router.get('/margin/chart/trend', auth, requireAdmin, marginC.chartTrend);
router.get('/margin/chart/top-items', auth, requireAdmin, marginC.chartTopItems);
router.get('/margin/chart/status', auth, requireAdmin, marginC.chartStatus);
router.get('/margin/chart/sales', auth, requireAdmin, marginC.chartSalesMargin);

module.exports = router;
