const express = require('express');
const cron = require('node-cron');

require ('dotenv').config();
const { dbConnection } = require('./database/config.js');
const { performOnusCheck } = require('./controllers/status.js')

const app = express();

//BASE DE DATOS
dbConnection();

//Configuración del cron job
cron.schedule('*/6 7-22 * * *', performOnusCheck, {
    timezone: "America/Bogota"
});

module.exports = app;