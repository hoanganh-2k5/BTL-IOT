require("dotenv").config();

const {Pool} = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

function query(text, params){
    return pool.query(text, params);
}

module.exports = {pool, query};