const express = require("express");
const app = express();
const env = require("dotenv").config();
const PORT = process.env.PORT;
const db = require("./config/db");
db();

app.listen(PORT,() => {
    console.log(`server is running at port : ${PORT}...`);
});
module.exports = app;