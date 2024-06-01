const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const { CustomError } = require('../exceptions/customError');

const SECRET_KEY = "your_jwt_secret_key";
const activeTokens = new Set();

const signup = async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const userResponse = await admin.auth().createUser({ email, password });

        await admin.auth().setCustomUserClaims(userResponse.uid, { role });

        res.json(userResponse);
    } catch (error) {
        console.error("Error signing up user:", error);
        res.status(500).json({ error: "Error signing up user" });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRecord = await admin.auth().getUserByEmail(email);

        const customClaims = (await admin.auth().getUser(userRecord.uid)).customClaims;
        const role = customClaims.role;

        const token = jwt.sign({ uid: userRecord.uid, email: userRecord.email, role }, SECRET_KEY, { expiresIn: '1h' });
        activeTokens.add(token);

        res.json({ token });
    } catch (error) {
        console.error("Error logging in user:", error);
        res.status(401).json({ error: "Invalid email or password" });
    }
};

const logout = (req, res) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (token && activeTokens.has(token)) {
        activeTokens.delete(token);
        res.json({ message: "Logged out successfully" });
    } else {
        res.status(400).json({ error: "User not logged in or invalid token" });
    }
};

module.exports = { signup, login, logout };
