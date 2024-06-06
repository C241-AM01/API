const express = require('express');
const router = express.Router();
const trackerService = require('../services/trackerService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/', authenticateJWT, authorizeRole(['admin']), upload.single('image'), trackerService.createTracker);
router.get('/', authenticateJWT, authorizeRole(['user', 'admin', 'pic']), trackerService.listTrackers);
router.get('/:tracker_id', authenticateJWT, authorizeRole(['user', 'admin', 'pic']), trackerService.getTracker);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['admin']), upload.single('image'), trackerService.updateTracker);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['admin']), trackerService.deleteTracker);
router.put('/request-edit/:tracker_id', authenticateJWT, authorizeRole(['pic']), trackerService.requestEdit);
router.put('/approve-edit/:tracker_id', authenticateJWT, authorizeRole(['admin']), trackerService.approveEdit);

module.exports = router;
