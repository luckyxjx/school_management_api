const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

async function main() {
    let pool;

    try {
        pool = mysql.createPool(DB_CONFIG);
        const connection = await pool.getConnection();
        console.log('Successfully connected to MySQL database pool.');
        connection.release();

        const app = express();
        app.use(express.json());

        app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });

        app.post('/addSchool', async (req, res) => {
            const { name, address, latitude, longitude } = req.body;
            let dbConnection;

            if (!name || typeof name !== 'string' || name.trim() === '') {
                return res.status(400).json({ error: 'Invalid or missing school name.' });
            }
            if (!address || typeof address !== 'string' || address.trim() === '') {
                return res.status(400).json({ error: 'Invalid or missing school address.' });
            }
            if (latitude === undefined || typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
                return res.status(400).json({ error: 'Invalid or missing latitude. Must be a number between -90 and 90.' });
            }
            if (longitude === undefined || typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
                return res.status(400).json({ error: 'Invalid or missing longitude. Must be a number between -180 and 180.' });
            }

            try {
                dbConnection = await pool.getConnection();
                const sql = 'INSERT INTO schools (name, address, latitude, longitude) VALUES (?, ?, ?, ?)';
                const [result] = await dbConnection.execute(sql, [name.trim(), address.trim(), latitude, longitude]);
                dbConnection.release();

                console.log(`School added with ID: ${result.insertId}`);
                res.status(201).json({
                    message: 'School added successfully!',
                    schoolId: result.insertId
                });

            } catch (err) {
                console.error('Error adding school:', err);
                if (dbConnection) dbConnection.release();
                res.status(500).json({ error: 'Database error: Failed to add school.' });
            }
        });

        app.get('/listSchools', async (req, res) => {
            const { lat, lon } = req.query;
            let dbConnection;

            const userLat = parseFloat(lat);
            const userLon = parseFloat(lon);

            if (isNaN(userLat) || userLat < -90 || userLat > 90) {
                return res.status(400).json({ error: 'Invalid or missing query parameter: user latitude (lat). Must be a number between -90 and 90.' });
            }
            if (isNaN(userLon) || userLon < -180 || userLon > 180) {
                return res.status(400).json({ error: 'Invalid or missing query parameter: user longitude (lon). Must be a number between -180 and 180.' });
            }

            try {
                dbConnection = await pool.getConnection();
                const sql = 'SELECT id, name, address, latitude, longitude FROM schools';
                const [schools] = await dbConnection.query(sql);
                dbConnection.release();

                const schoolsWithDistance = schools.map(school => ({
                    ...school,
                    distance_km: parseFloat(calculateDistance(userLat, userLon, school.latitude, school.longitude).toFixed(2))
                }));

                schoolsWithDistance.sort((a, b) => a.distance_km - b.distance_km);
                res.status(200).json(schoolsWithDistance);

            } catch (err) {
                console.error('Error listing schools:', err);
                if (dbConnection) dbConnection.release();
                res.status(500).json({ error: 'Database error: Failed to retrieve schools.' });
            }
        });

        app.get('/', (req, res) => {
            res.send('School Management API is running!');
        });

        app.use((err, req, res, next) => {
            console.error("An unexpected error occurred:", err.stack);
            res.status(500).json({ error: 'Something went wrong on the server!' });
        });

        app.listen(PORT, () => {
            console.log(`Server is running and listening on http://localhost:${PORT}`);
        });

    } catch (err) {
        console.error('FATAL ERROR: Failed to connect to the database or start the server.', err);
        if (pool) await pool.end();
        process.exit(1);
    }
}

main();