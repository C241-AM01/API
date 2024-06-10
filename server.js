const express = require('express');
const bodyParser = require('body-parser');
const { initializeFirebase } = require('./config/firebaseConfig');

initializeFirebase();

const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/asset');
const trackerRoutes = require('./routes/tracker');
const warehouseRoutes = require('./routes/warehouse');

const app = express();

app.use(bodyParser.json());

app.use('/auth', authRoutes);
app.use('/asset', assetRoutes);
app.use('/tracker', trackerRoutes);
app.use('/warehouse', warehouseRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
