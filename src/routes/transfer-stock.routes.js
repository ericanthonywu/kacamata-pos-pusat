const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/transfer-stock.controller');

router.get('/', auth, c.index);
router.get('/external-items', auth, c.getExternalItems);
router.post('/execute', auth, c.executeTransfer);

module.exports = router;
