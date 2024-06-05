const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const SECRET_KEY = "your_jwt_secret_key";

const authenticateJWT = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        console.log("No token found");
        return res.sendStatus(401);
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.log("Token verification failed:", err);
            return res.sendStatus(403);
        }

        console.log("User authenticated:", user);
        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        console.log("Authorizing role. User role:", req.user.role, "Allowed roles:", roles);
        if (!roles.includes(req.user.role)) {
            return res.sendStatus(403);
        }
        next();
    };
};

module.exports = { authenticateJWT, authorizeRole };
