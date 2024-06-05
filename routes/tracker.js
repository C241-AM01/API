const express = require('express');
const router = express.Router();
const trackerService = require('../services/trackerService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole(['Admin']), trackerService.createTracker);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), trackerService.queryTracker);
router.get('/:tracker_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), trackerService.getTracker);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.updateTracker);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.deleteTracker);
router.put('/request-edit/:tracker_id', authenticateJWT, authorizeRole(['PIC']), trackerService.requestEdit);
router.put('/approve-edit/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.approveEdit);
router.put('/update-location/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.updateLocation); 


module.exports = router;
